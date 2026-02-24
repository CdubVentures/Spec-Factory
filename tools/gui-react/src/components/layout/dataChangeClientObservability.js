function toCount(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizedCategory(value) {
  const token = String(value || '').trim().toLowerCase();
  return token && token !== 'all' ? token : '';
}

function dedupedCategories(categories) {
  const source = Array.isArray(categories) ? categories : [categories];
  const output = new Set();
  for (const category of source) {
    const token = normalizedCategory(category);
    if (token) output.add(token);
  }
  return [...output];
}

const state = {
  invalidation: {
    flush_total: 0,
    query_keys_total: 0,
    categories_total: 0,
    by_category: {},
    last_flush_at: null,
  },
};

export function resetDataChangeClientObservability() {
  state.invalidation.flush_total = 0;
  state.invalidation.query_keys_total = 0;
  state.invalidation.categories_total = 0;
  state.invalidation.by_category = {};
  state.invalidation.last_flush_at = null;
}

export function recordDataChangeInvalidationFlush({
  queryKeys = [],
  categories = [],
} = {}) {
  const queryKeyCount = Array.isArray(queryKeys) ? queryKeys.length : toCount(queryKeys);
  const scopedCategories = dedupedCategories(categories);
  const ts = new Date().toISOString();

  state.invalidation.flush_total += 1;
  state.invalidation.query_keys_total += queryKeyCount;
  state.invalidation.categories_total += scopedCategories.length;
  state.invalidation.last_flush_at = ts;

  for (const category of scopedCategories) {
    if (!state.invalidation.by_category[category]) {
      state.invalidation.by_category[category] = {
        flush_total: 0,
        query_keys_total: 0,
      };
    }
    state.invalidation.by_category[category].flush_total += 1;
    state.invalidation.by_category[category].query_keys_total += queryKeyCount;
  }

  return {
    ts,
    queryKeyCount,
    categories: scopedCategories,
  };
}

export function getDataChangeClientObservabilitySnapshot() {
  return JSON.parse(JSON.stringify(state));
}
