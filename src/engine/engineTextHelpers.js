// WHY: Text/token utility functions for the engine subsystem.
// Primitives imported from shared SSOT; engine-specific helpers defined locally.
import { isObject, toArray, normalizeText, normalizeToken, normalizeFieldKey } from '../shared/primitives.js';

export { isObject, toArray, normalizeText, normalizeToken, normalizeFieldKey };

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

export { safeJsonParse } from '../utils/common.js';
