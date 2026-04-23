/**
 * Deterministic value fingerprint for field_candidates.
 *
 * Scalar fields: NFC-normalized, lower-cased, trimmed string form of the value.
 * List fields:   set-equality fingerprint — items are normalized individually,
 *                deduplicated, sorted, and joined with a delimiter that cannot
 *                appear in normalized content.
 *
 * Used by the publisher to pool evidence across candidate rows that agree on
 * the same value. Two rows sharing a fingerprint contribute to the same bucket.
 */

const LIST_DELIM = '\u0001';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  const body = keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',');
  return `{${body}}`;
}

function normalizeItem(item) {
  if (item === null || item === undefined) return '';
  if (typeof item === 'object') return stableStringify(item);
  return String(item).normalize('NFC').toLowerCase().trim();
}

function isListShape(fieldRule, rawValue) {
  if (fieldRule?.contract?.shape === 'list') return true;
  if (fieldRule?.contract?.shape === 'scalar') return false;
  return Array.isArray(rawValue);
}

export function fingerprintValue(rawValue, fieldRule) {
  if (rawValue === null || rawValue === undefined) return '';
  if (isListShape(fieldRule, rawValue)) {
    if (!Array.isArray(rawValue)) return '';
    const normalized = rawValue.map(normalizeItem).filter(item => item !== '');
    return Array.from(new Set(normalized)).sort().join(LIST_DELIM);
  }
  return normalizeItem(rawValue);
}
