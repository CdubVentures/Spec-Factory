import { ABSENCE_TOKENS } from './absenceTokens.js';

/**
 * Canonicalizes absence values before shape check (Step 0).
 * @param {*} value - Raw field value
 * @param {'scalar'|'list'} shape - Expected shape from field contract
 * @returns {*} Canonical form: null for scalar absence, [] for list.
 */
export function normalizeAbsence(value, shape) {
  if (value === null || value === undefined) {
    if (shape === 'list') return [];
    return null;
  }

  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === '' || ABSENCE_TOKENS.has(lower)) return null;
    return value;
  }

  if (Array.isArray(value)) {
    return value.filter(v => v !== null && v !== undefined && v !== '');
  }

  return value;
}
