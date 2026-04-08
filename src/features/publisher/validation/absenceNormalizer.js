import { UNK_TOKENS } from './unkTokens.js';

/**
 * Canonicalizes absence values before shape check (Step 0).
 * @param {*} value - Raw field value
 * @param {'scalar'|'list'|'record'} shape - Expected shape from field contract
 * @returns {*} Canonical form: 'unk' for scalar absence, [] for list, {} for record.
 */
export function normalizeAbsence(value, shape) {
  if (value === null || value === undefined) {
    if (shape === 'list') return [];
    if (shape === 'record') return {};
    return 'unk';
  }

  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === '' || UNK_TOKENS.has(lower)) return 'unk';
    return value;
  }

  if (Array.isArray(value)) {
    return value.filter(v => v !== null && v !== undefined && v !== '');
  }

  return value;
}
