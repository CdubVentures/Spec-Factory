function normalizePositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

function normalizeBurst(rate, burst) {
  const normalizedRate = normalizePositiveNumber(rate);
  const normalizedBurst = normalizePositiveNumber(burst);
  if (normalizedRate <= 0 || normalizedBurst <= 0) {
    return 0;
  }
  return Math.max(1, normalizedBurst);
}

function createTokenBucket({ rps = 0, burst = 0, nowFn = Date.now } = {}) {
  const rate = normalizePositiveNumber(rps);
  const cap = normalizeBurst(rate, burst);
  if (rate <= 0 || cap <= 0) {
    return null;
  }

  let tokens = cap;
  let lastRefillMs = Number(nowFn()) || 0;

  const refill = (nowMs) => {
    const safeNow = Number(nowMs) || 0;
    const elapsedMs = Math.max(0, safeNow - lastRefillMs);
    if (elapsedMs > 0) {
      tokens = Math.min(cap, tokens + ((elapsedMs / 1000) * rate));
      lastRefillMs = safeNow;
    }
  };

  const waitMs = (nowMs) => {
    refill(nowMs);
    if (tokens >= 1) {
      return 0;
    }
    const missing = 1 - tokens;
    return Math.max(1, Math.ceil((missing / rate) * 1000));
  };

  const consume = (nowMs) => {
    refill(nowMs);
    if (tokens < 1) {
      return false;
    }
    tokens -= 1;
    return true;
  };

  return {
    waitMs,
    consume
  };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeThrottleKey(key) {
  const token = String(key || '').trim().toLowerCase();
  return token || 'global';
}

function normalizeCooldownMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.ceil(parsed);
}

export function createRequestThrottler({
  globalRps = 0,
  globalBurst = 0,
  keyRps = 0,
  keyBurst = 0,
  nowFn = Date.now,
  sleepFn = defaultSleep
} = {}) {
  const globalBucket = createTokenBucket({ rps: globalRps, burst: globalBurst, nowFn });
  const keyedBucketFactoryEnabled = normalizePositiveNumber(keyRps) > 0 && normalizeBurst(keyRps, keyBurst) > 0;
  const keyedBuckets = new Map();
  const penaltyUntilByKey = new Map();

  const resolveKeyBucket = (key) => {
    if (!keyedBucketFactoryEnabled) {
      return null;
    }
    const normalizedKey = normalizeThrottleKey(key);
    if (!keyedBuckets.has(normalizedKey)) {
      keyedBuckets.set(
        normalizedKey,
        createTokenBucket({
          rps: keyRps,
          burst: keyBurst,
          nowFn
        })
      );
    }
    return keyedBuckets.get(normalizedKey);
  };

  const resolvePenaltyWaitMs = (key, nowMs) => {
    const normalizedKey = normalizeThrottleKey(key);
    const penaltyUntilMs = Number(penaltyUntilByKey.get(normalizedKey)) || 0;
    if (penaltyUntilMs <= 0) {
      return 0;
    }
    const waitMs = Math.max(0, penaltyUntilMs - (Number(nowMs) || 0));
    if (waitMs <= 0) {
      penaltyUntilByKey.delete(normalizedKey);
      return 0;
    }
    return waitMs;
  };

  const penalizeInternal = ({ key = '', cooldownMs = 0 } = {}) => {
    const normalizedKey = normalizeThrottleKey(key);
    const normalizedCooldownMs = normalizeCooldownMs(cooldownMs);
    if (normalizedCooldownMs <= 0) {
      return 0;
    }
    const nowMs = Number(nowFn()) || 0;
    const currentUntilMs = Number(penaltyUntilByKey.get(normalizedKey)) || 0;
    const nextUntilMs = Math.max(currentUntilMs, nowMs + normalizedCooldownMs);
    penaltyUntilByKey.set(normalizedKey, nextUntilMs);
    return Math.max(0, nextUntilMs - nowMs);
  };

  let tail = Promise.resolve();

  const acquireInternal = async ({ key = '' } = {}) => {
    const normalizedKey = normalizeThrottleKey(key);
    const keyBucket = resolveKeyBucket(normalizedKey);
    let waitedMs = 0;

    while (true) {
      const nowMs = Number(nowFn()) || 0;
      const globalWaitMs = globalBucket ? globalBucket.waitMs(nowMs) : 0;
      const keyWaitMs = keyBucket ? keyBucket.waitMs(nowMs) : 0;
      const globalPenaltyWaitMs = resolvePenaltyWaitMs('global', nowMs);
      const keyPenaltyWaitMs = normalizedKey === 'global' ? 0 : resolvePenaltyWaitMs(normalizedKey, nowMs);
      const requiredWaitMs = Math.max(globalWaitMs, keyWaitMs, globalPenaltyWaitMs, keyPenaltyWaitMs);

      if (requiredWaitMs > 0) {
        await sleepFn(requiredWaitMs);
        waitedMs += requiredWaitMs;
        continue;
      }

      const consumeNowMs = Number(nowFn()) || nowMs;
      const globalConsumed = globalBucket ? globalBucket.consume(consumeNowMs) : true;
      const keyConsumed = keyBucket ? keyBucket.consume(consumeNowMs) : true;

      if (globalConsumed && keyConsumed) {
        return waitedMs;
      }
    }
  };

  return {
    async acquire(args = {}) {
      const call = () => acquireInternal(args);
      const current = tail.then(call, call);
      tail = current.catch(() => {});
      return current;
    },
    penalize(args = {}) {
      return penalizeInternal(args);
    }
  };
}

function normalizeMaxInFlight(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

export function createHostConcurrencyGate({
  maxInFlight = 0
} = {}) {
  const cap = normalizeMaxInFlight(maxInFlight);
  if (cap <= 0) {
    return {
      async run({ task } = {}) {
        if (typeof task !== 'function') {
          throw new TypeError('task must be a function');
        }
        return task();
      }
    };
  }

  const stateByKey = new Map();

  const ensureState = (key) => {
    if (!stateByKey.has(key)) {
      stateByKey.set(key, {
        active: 0,
        waiters: []
      });
    }
    return stateByKey.get(key);
  };

  const cleanupState = (key) => {
    const state = stateByKey.get(key);
    if (!state) {
      return;
    }
    if (state.active === 0 && state.waiters.length === 0) {
      stateByKey.delete(key);
    }
  };

  const release = (key) => {
    const state = stateByKey.get(key);
    if (!state) {
      return;
    }
    state.active = Math.max(0, state.active - 1);
    const next = state.waiters.shift();
    if (next) {
      next();
      return;
    }
    cleanupState(key);
  };

  const acquire = (key) =>
    new Promise((resolve) => {
      const state = ensureState(key);
      const grant = () => {
        state.active += 1;
        resolve(() => release(key));
      };
      if (state.active < cap) {
        grant();
        return;
      }
      state.waiters.push(grant);
    });

  return {
    async run({ key = 'global', task } = {}) {
      if (typeof task !== 'function') {
        throw new TypeError('task must be a function');
      }
      const normalizedKey = normalizeThrottleKey(key);
      const releaseFn = await acquire(normalizedKey);
      try {
        return await task();
      } finally {
        releaseFn();
      }
    }
  };
}
