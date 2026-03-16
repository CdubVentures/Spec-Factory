import {
  resolveDataChangeInvalidationQueryKeys,
} from './invalidationResolver.js';
import { collectDataChangeCategories } from './categoryScope.js';

function toDelayMs(value, fallback = 75) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function queryKeySignature(queryKey) {
  if (!Array.isArray(queryKey)) return '';
  return JSON.stringify(queryKey);
}

export function createDataChangeInvalidationScheduler({
  queryClient = null,
  delayMs = 75,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  onFlush = null,
} = {}) {
  const pendingQueryKeys = new Map();
  const pendingCategories = new Set();
  let timerId = null;
  const scheduleDelay = toDelayMs(delayMs, 75);

  function flush() {
    if (timerId !== null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
    const queryKeys = [...pendingQueryKeys.values()];
    const categories = [...pendingCategories.values()];
    pendingQueryKeys.clear();
    pendingCategories.clear();
    if (!queryClient || typeof queryClient.invalidateQueries !== 'function') {
      if (typeof onFlush === 'function') {
        onFlush({
          ts: new Date().toISOString(),
          queryKeys: [],
          queryKeyCount: 0,
          categories,
        });
      }
      return [];
    }
    for (const queryKey of queryKeys) {
      queryClient.invalidateQueries({ queryKey });
    }
    if (typeof onFlush === 'function') {
      onFlush({
        ts: new Date().toISOString(),
        queryKeys,
        queryKeyCount: queryKeys.length,
        categories,
      });
    }
    return queryKeys;
  }

  function schedule({
    message,
    categories = [],
    fallbackCategory = '',
  } = {}) {
    const queryKeys = resolveDataChangeInvalidationQueryKeys({
      message,
      categories,
      fallbackCategory,
    });
    const scopedCategories = collectDataChangeCategories({ categories, fallbackCategory });
    for (const scopedCategory of scopedCategories) {
      pendingCategories.add(scopedCategory);
    }
    for (const queryKey of queryKeys) {
      const signature = queryKeySignature(queryKey);
      if (!signature) continue;
      pendingQueryKeys.set(signature, queryKey);
    }
    if (pendingQueryKeys.size === 0 || timerId !== null) {
      return queryKeys;
    }
    timerId = setTimeoutFn(() => {
      timerId = null;
      flush();
    }, scheduleDelay);
    return queryKeys;
  }

  function dispose() {
    if (timerId !== null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
    pendingQueryKeys.clear();
    pendingCategories.clear();
  }

  return {
    schedule,
    flush,
    dispose,
    pendingCount: () => pendingQueryKeys.size,
  };
}
