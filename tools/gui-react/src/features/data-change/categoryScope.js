export function normalizeDataChangeCategory(value) {
  const token = String(value || '').trim().toLowerCase();
  if (!token || token === 'all') return '';
  return token;
}

export function collectDataChangeCategories({
  categories = [],
  fallbackCategory = '',
} = {}) {
  const source = Array.isArray(categories) ? categories : [categories];
  const scoped = new Set();
  for (const category of source) {
    const token = normalizeDataChangeCategory(category);
    if (token) scoped.add(token);
  }
  if (scoped.size === 0) {
    const fallback = normalizeDataChangeCategory(fallbackCategory);
    if (fallback) scoped.add(fallback);
  }
  return [...scoped];
}
