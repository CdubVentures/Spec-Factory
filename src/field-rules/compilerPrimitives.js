/**
 * Pure, zero-dependency utility functions used across compiler modules.
 * Leaf node — no internal imports.
 */

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function normalizeFieldKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function titleCase(value) {
  return String(value || '')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(' ');
}

export function nonEmptyString(value) {
  return String(value || '').trim().length > 0;
}

export function asNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function pickGeneratedAt(fieldRules = {}) {
  return String(fieldRules.generated_at || '').trim() || new Date(0).toISOString();
}

export function toPhase1Group(value) {
  const token = normalizeFieldKey(value || '');
  return token || 'general';
}

export function toSafeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCategoryList(values = []) {
  return [...new Set(toArray(values)
    .map((value) => normalizeFieldKey(value))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}
