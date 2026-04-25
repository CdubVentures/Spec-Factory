import { isUnknownSentinel } from '../../../shared/valueNormalizers.js';

export const UNKNOWN_LIKE_TOKENS = new Set(['', 'unknown', 'n/a', 'na', 'null', 'undefined', '-']);

export function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isMeaningfulValue(value) {
  if (value == null) return false;
  if (isUnknownSentinel(value)) return false;
  return !UNKNOWN_LIKE_TOKENS.has(normalizeLower(value));
}

export function candidateLooksReference(candidateId, sourceToken = '') {
  const token = String(sourceToken || '').trim().toLowerCase();
  const cid = String(candidateId || '').trim();
  return cid.startsWith('ref_')
    || cid.startsWith('ref-')
    || cid.includes('::ref_')
    || cid.includes('::ref-')
    || token.includes('reference')
    || token.includes('component_db');
}
