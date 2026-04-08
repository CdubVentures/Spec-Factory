export function normalizeCategoryToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+$/g, '');
}

function assertCategoryAliasDependencies({ helperRoot, path, existsSync }) {
  if (!String(helperRoot || '').trim()) {
    throw new TypeError('helperRoot must be a non-empty string');
  }
  if (!path || typeof path.join !== 'function') {
    throw new TypeError('path.join must be available');
  }
  if (typeof existsSync !== 'function') {
    throw new TypeError('existsSync must be a function');
  }
}

export function createCategoryAliasResolver({
  helperRoot,
  path,
  existsSync,
} = {}) {
  assertCategoryAliasDependencies({ helperRoot, path, existsSync });

  function categoryExists(category) {
    if (!category) return false;
    const categoryPath = path.join(helperRoot, category);
    return existsSync(categoryPath);
  }

  return function resolveCategoryAlias(category) {
    const normalized = normalizeCategoryToken(category);
    if (!normalized) return normalized;
    return normalized;
  };
}
