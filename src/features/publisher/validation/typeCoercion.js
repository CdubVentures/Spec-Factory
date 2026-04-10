// WHY: O(1) type-driven coercion. Replaces both templateDispatch.js and checkType.js.
// Adding a type = add one coercer function + one entry in TYPE_COERCERS.

import { ABSENCE_TOKENS } from './absenceTokens.js';
import { normalizeBoolean, parseDate, parseNumberListWithRanges } from './normalizers.js';

// ── Per-type coercers ─────────────────────────────────────────────────────

function coerceString(value) {
  if (value === null) return { pass: true, value: null };
  if (typeof value === 'string') return { pass: true, value };
  if (typeof value === 'number') return { pass: true, repaired: String(value), rule: 'number_to_string' };
  if (typeof value === 'boolean') return { pass: true, repaired: value ? 'yes' : 'no', rule: 'bool_to_string' };
  return { pass: false, reason: `expected string, got ${typeof value}` };
}

function coerceNumber(value) {
  if (value === null) return { pass: true, value: null };
  if (typeof value === 'number' && Number.isFinite(value)) return { pass: true, value };
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === '' || ABSENCE_TOKENS.has(lower)) return { pass: true, repaired: null, rule: 'absence_token' };
    const stripped = value.replace(/[^\d.\-]/g, '');
    if (stripped.length > 0) {
      const parsed = Number(stripped);
      if (Number.isFinite(parsed)) return { pass: true, repaired: parsed, rule: 'string_to_number' };
    }
    return { pass: false, reason: `expected number, got non-numeric string: "${value}"` };
  }
  return { pass: false, reason: `expected number, got ${typeof value}` };
}

function coerceBoolean(value) {
  // WHY: absence normalizer (Step 0) already converts absence tokens to null before coercion.
  if (value == null) return { pass: true, value: null };
  const result = normalizeBoolean(value);
  if (result === null) return { pass: false, reason: `unrecognized boolean value: ${String(value)}` };
  return { pass: true, repaired: result, rule: 'bool_coerce' };
}

function coerceDate(value) {
  if (value === null) return { pass: true, value: null };
  const result = parseDate(value);
  if (result === null) return { pass: false, reason: `unparseable date: ${String(value)}` };
  return { pass: true, repaired: result, rule: 'date_coerce' };
}

function coerceUrl(value) {
  if (value === null) return { pass: true, value };
  if (typeof value !== 'string') return { pass: false, reason: `expected URL string, got ${typeof value}` };
  if (/^https?:\/\/.+/.test(value)) return { pass: true, value };
  return { pass: false, reason: `invalid URL: "${value}"` };
}

const RANGE_SEP = /[-\u2013]/; // hyphen or en-dash

function extractNum(token) {
  const m = String(token).trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function coerceRange(value) {
  if (value === null) return { pass: true, value: null };
  if (typeof value === 'string') {
    const parts = value.split(RANGE_SEP);
    if (parts.length === 2) {
      const lo = extractNum(parts[0]);
      const hi = extractNum(parts[1]);
      if (lo !== null && hi !== null) {
        return { pass: true, repaired: { min: lo, max: hi }, rule: 'range_parse' };
      }
    }
  }
  return { pass: false, reason: `expected range (e.g. "1-5"), got: ${String(value)}` };
}

function coerceMixedNumberRange(value) {
  const result = parseNumberListWithRanges(value);
  return { pass: true, repaired: result, rule: 'mixed_number_range_coerce' };
}

// ── O(1) dispatch map ───────────────────────────────────────────────────────

const TYPE_COERCERS = {
  string: coerceString,
  number: coerceNumber,
  integer: coerceNumber, // WHY: integer enforcement via contract.rounding.decimals=0
  boolean: coerceBoolean,
  date: coerceDate,
  url: coerceUrl,
  range: coerceRange,
  mixed_number_range: coerceMixedNumberRange,
};

/**
 * Type-driven coercion. Applies the appropriate coercer for the given type.
 * Works on a single value — list iteration is handled by the pipeline.
 *
 * @param {*} value
 * @param {string} type - from contract.type
 * @returns {{ pass: boolean, value?: *, repaired?: *, rule?: string, reason?: string }}
 */
export function coerceByType(value, type) {
  const coercer = TYPE_COERCERS[type];
  if (!coercer) return { pass: false, reason: `unknown type: ${type}` };
  return coercer(value);
}
