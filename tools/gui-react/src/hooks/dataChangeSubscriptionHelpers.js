function normalizedToken(value) {
  return String(value || '').trim();
}

function normalizedLowerToken(value) {
  return normalizedToken(value).toLowerCase();
}

function normalizedCategoryList(message) {
  const msg = message && typeof message === 'object' ? message : {};
  const categories = [];
  if (Array.isArray(msg.categories)) {
    categories.push(...msg.categories);
  }
  if (msg.category) {
    categories.push(msg.category);
  }
  const output = [];
  const seen = new Set();
  for (const rawCategory of categories) {
    const token = normalizedLowerToken(rawCategory);
    if (!token || token === 'all' || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
  }
  return output;
}

export function resolveDataChangeEventName(message) {
  const msg = message && typeof message === 'object' ? message : {};
  const explicitEvent = normalizedToken(msg.event);
  if (explicitEvent) return explicitEvent;
  const legacyType = normalizedToken(msg.type);
  if (legacyType && legacyType !== 'data-change') {
    return legacyType;
  }
  return '';
}

export function dataChangeAffectsCategory(message, category) {
  const target = normalizedLowerToken(category);
  if (!target || target === 'all') return true;
  const scoped = normalizedCategoryList(message);
  if (scoped.length === 0) return true;
  return scoped.includes(target);
}

export function dataChangeAffectsDomains(message, domains) {
  const filters = Array.isArray(domains)
    ? domains.map((domain) => normalizedLowerToken(domain)).filter(Boolean)
    : [];
  if (filters.length === 0) return true;

  const msg = message && typeof message === 'object' ? message : {};
  const msgDomains = Array.isArray(msg.domains)
    ? msg.domains.map((domain) => normalizedLowerToken(domain)).filter(Boolean)
    : [];
  if (msgDomains.length === 0) return true;
  return msgDomains.some((domain) => filters.includes(domain));
}

export function shouldHandleDataChangeMessage({
  message,
  category,
  domains = [],
}) {
  if (!resolveDataChangeEventName(message)) return false;
  if (!dataChangeAffectsCategory(message, category)) return false;
  if (!dataChangeAffectsDomains(message, domains)) return false;
  return true;
}
