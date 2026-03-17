// WHY: Shared pure text/token utility functions extracted from fieldRulesEngine.js.
// Also consolidates duplicates from ruleAccessors.js and curationSuggestions.js.

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeToken(value) {
  return normalizeText(value).toLowerCase();
}

export function normalizeFieldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isUnknownToken(value) {
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return isUnknownToken(value.value);
  }
  const token = normalizeToken(value);
  return token === '' || token === 'unk' || token === 'unknown' || token === 'n/a' || token === '-' || token === 'none';
}

export function canonicalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isValidIsoDateTime(value) {
  if (!value) {
    return false;
  }
  const text = String(value).trim();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && text.includes('T');
}

export function safeJsonParse(raw = '') {
  try {
    return JSON.parse(String(raw || ''));
  } catch {
    return null;
  }
}
