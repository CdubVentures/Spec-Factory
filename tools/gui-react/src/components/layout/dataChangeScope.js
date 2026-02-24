function normalizedToken(value) {
  return String(value || '').trim();
}

export function resolveDataChangeScopedCategories(message, fallbackCategory) {
  const msg = message && typeof message === 'object' ? message : {};
  const fallback = normalizedToken(fallbackCategory);
  const scoped = new Set();
  const msgCategory = normalizedToken(msg.category);

  if (Array.isArray(msg.categories)) {
    for (const rawCategory of msg.categories) {
      const next = normalizedToken(rawCategory);
      if (next && next !== 'all') scoped.add(next);
    }
  }
  if (msgCategory && msgCategory !== 'all') {
    scoped.add(msgCategory);
  }

  if (scoped.size === 0 && fallback) {
    scoped.add(fallback);
  }
  return [...scoped];
}

export function applyDataChangeInvalidation({
  message,
  fallbackCategory,
  invalidateForCategory,
}) {
  if (typeof invalidateForCategory !== 'function') return [];
  const scopedCategories = resolveDataChangeScopedCategories(message, fallbackCategory);
  for (const scopedCategory of scopedCategories) {
    invalidateForCategory(scopedCategory);
  }
  return scopedCategories;
}
