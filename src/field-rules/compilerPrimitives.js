/**
 * Pure utility functions used across compiler modules.
 * Primitives imported from shared SSOT; domain-specific helpers defined locally.
 */
import { isObject, toArray, normalizeToken, normalizeFieldKey } from '../shared/primitives.js';
import { toInt as toSafeInt } from '../shared/valueNormalizers.js';

export { isObject, toArray, normalizeToken, normalizeFieldKey, toSafeInt };

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

export function normalizeCategoryList(values = []) {
  return [...new Set(toArray(values)
    .map((value) => normalizeFieldKey(value))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}
