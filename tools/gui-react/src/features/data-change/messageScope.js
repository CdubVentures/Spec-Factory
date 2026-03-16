import { collectDataChangeCategories } from './categoryScope.js';

export function resolveDataChangeScopedCategories(message, fallbackCategory) {
  const msg = message && typeof message === 'object' ? message : {};
  return collectDataChangeCategories({
    categories: [msg.category, ...(Array.isArray(msg.categories) ? msg.categories : [])],
    fallbackCategory,
  });
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
