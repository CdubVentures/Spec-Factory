function normalizeToken(value) {
  return String(value || '').trim();
}

export function coerceCategories(values, fallback = ['mouse']) {
  const input = Array.isArray(values) ? values : [];
  const seen = new Set();
  const output = [];
  for (const raw of input) {
    const token = normalizeToken(raw);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }
  if (output.length > 0) return output;
  return Array.isArray(fallback) && fallback.length > 0 ? fallback.map(normalizeToken).filter(Boolean) : ['mouse'];
}

export function resolveActiveCategory({ currentCategory, categories }) {
  const normalizedCategories = coerceCategories(categories);
  const current = normalizeToken(currentCategory);
  if (current && normalizedCategories.includes(current)) {
    return current;
  }
  return normalizedCategories[0] || 'mouse';
}

