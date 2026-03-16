function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`createRuntimeOverridesLoader requires ${name}`);
  }
}

function normalizeThrottleMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 3000;
  }
  return parsed;
}

export function createRuntimeOverridesLoader({
  storage,
  config = {},
  resolveRuntimeControlKeyFn,
  defaultRuntimeOverridesFn,
  normalizeRuntimeOverridesFn,
  nowFn = Date.now,
  readThrottleMs = 3000,
} = {}) {
  validateFunctionArg('resolveRuntimeControlKeyFn', resolveRuntimeControlKeyFn);
  validateFunctionArg('defaultRuntimeOverridesFn', defaultRuntimeOverridesFn);
  validateFunctionArg('normalizeRuntimeOverridesFn', normalizeRuntimeOverridesFn);
  validateFunctionArg('nowFn', nowFn);

  const runtimeControlKey = resolveRuntimeControlKeyFn(storage, config);
  const throttleMs = normalizeThrottleMs(readThrottleMs);
  let runtimeOverrides = defaultRuntimeOverridesFn();
  let runtimeOverridesLastLoadMs = 0;

  async function loadRuntimeOverrides({ force = false } = {}) {
    const now = nowFn();
    if (!force && now - runtimeOverridesLastLoadMs < throttleMs) {
      return runtimeOverrides;
    }

    runtimeOverridesLastLoadMs = now;
    try {
      const payload = await storage.readJsonOrNull(runtimeControlKey);
      runtimeOverrides = normalizeRuntimeOverridesFn(payload || {});
    } catch {
      runtimeOverrides = defaultRuntimeOverridesFn();
    }

    return runtimeOverrides;
  }

  return {
    runtimeControlKey,
    getRuntimeOverrides() {
      return runtimeOverrides;
    },
    loadRuntimeOverrides,
  };
}

