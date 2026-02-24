function normalizedToken(value, { lowercase = false } = {}) {
  const token = String(value || '').trim();
  if (!token) return '';
  return lowercase ? token.toLowerCase() : token;
}

function normalizedCategory(value) {
  return normalizedToken(value, { lowercase: true });
}

function incrementCounter(map, key, amount = 1) {
  if (!key) return;
  map[key] = Number(map[key] || 0) + Number(amount || 0);
}

function resolvedCategories({ category = '', categories = [] } = {}) {
  const output = new Set();
  const categoryToken = normalizedCategory(category);
  if (categoryToken && categoryToken !== 'all') {
    output.add(categoryToken);
  }
  const source = Array.isArray(categories) ? categories : [categories];
  for (const entry of source) {
    const token = normalizedCategory(entry);
    if (!token || token === 'all') continue;
    output.add(token);
  }
  return [...output];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const state = {
  broadcast: {
    total: 0,
    by_event: {},
    by_category: {},
    last_broadcast_at: null,
  },
  queue_cleanup: {
    attempt_total: 0,
    success_total: 0,
    failed_total: 0,
    by_category: {},
    last_success_at: null,
    last_failure_at: null,
    last_failure_reason: '',
  },
};

export function resetDataPropagationCounters() {
  state.broadcast.total = 0;
  state.broadcast.by_event = {};
  state.broadcast.by_category = {};
  state.broadcast.last_broadcast_at = null;

  state.queue_cleanup.attempt_total = 0;
  state.queue_cleanup.success_total = 0;
  state.queue_cleanup.failed_total = 0;
  state.queue_cleanup.by_category = {};
  state.queue_cleanup.last_success_at = null;
  state.queue_cleanup.last_failure_at = null;
  state.queue_cleanup.last_failure_reason = '';
}

export function recordDataChangeBroadcast({
  event = '',
  category = '',
  categories = [],
} = {}) {
  const ts = new Date().toISOString();
  const eventToken = normalizedToken(event, { lowercase: true });
  const scopedCategories = resolvedCategories({ category, categories });

  state.broadcast.total += 1;
  if (eventToken) incrementCounter(state.broadcast.by_event, eventToken, 1);
  for (const scopedCategory of scopedCategories) {
    incrementCounter(state.broadcast.by_category, scopedCategory, 1);
  }
  state.broadcast.last_broadcast_at = ts;

  return {
    ts,
    event: eventToken,
    categories: scopedCategories,
  };
}

export function recordQueueCleanupOutcome({
  category = '',
  success = false,
  reason = '',
} = {}) {
  const ts = new Date().toISOString();
  const categoryToken = normalizedCategory(category) || 'unknown';
  const cleanupState = state.queue_cleanup;
  cleanupState.attempt_total += 1;

  if (!cleanupState.by_category[categoryToken]) {
    cleanupState.by_category[categoryToken] = {
      attempt_total: 0,
      success_total: 0,
      failed_total: 0,
      last_success_at: null,
      last_failure_at: null,
      last_failure_reason: '',
    };
  }

  const categoryState = cleanupState.by_category[categoryToken];
  categoryState.attempt_total += 1;

  if (success) {
    cleanupState.success_total += 1;
    cleanupState.last_success_at = ts;
    categoryState.success_total += 1;
    categoryState.last_success_at = ts;
    return { ts, category: categoryToken, success: true };
  }

  const failureReason = normalizedToken(reason) || 'queue_cleanup_failed';
  cleanupState.failed_total += 1;
  cleanupState.last_failure_at = ts;
  cleanupState.last_failure_reason = failureReason;
  categoryState.failed_total += 1;
  categoryState.last_failure_at = ts;
  categoryState.last_failure_reason = failureReason;
  return { ts, category: categoryToken, success: false, reason: failureReason };
}

export function getDataPropagationCountersSnapshot() {
  return cloneJson(state);
}
