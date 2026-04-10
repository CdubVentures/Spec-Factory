import { resolveUnit } from '../../../../field-rules/unitRegistry.js';

// WHY: regex captures number + optional unit suffix.
// Handles simple ("42g"), spaced ("42 g"), multi-word ("110 pixels per inch"),
// hyphenated ("60 gram-force"), slash ("500 cd/m2"), symbol ("100 °"), and
// quote-mark inch notation ('49"'). First suffix char must be a letter/symbol
// (not digit) to avoid ambiguity.
const UNIT_REGEX = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z%°"\u00b5\u03a9](?:[a-zA-Z0-9 %°"\u00b2\u00b3\u00b5\u03a9/()\-]*[a-zA-Z0-9%°"\u00b2\u00b3\u00b5\u03a9)])?)?$/;

/**
 * Unit verification (Step 3). Resolves synonyms, converts units via the
 * managed unit registry, strips valid unit suffixes to bare numbers.
 *
 * @param {*} value - Field value (post-shape-check)
 * @param {string} expectedUnit - from contract.unit
 * @param {object} [appDb] - AppDb instance for registry lookup (optional — falls back to exact match)
 * @returns {{ pass: boolean, value?: *, rule?: string, reason?: string, detail?: { expected: string, detected: string } }}
 */
export function checkUnit(value, expectedUnit, appDb) {
  if (!expectedUnit) {
    return { pass: true, value };
  }

  if (value === null) {
    return { pass: true, value: null };
  }

  if (typeof value === 'number') {
    return { pass: true, value };
  }

  if (typeof value !== 'string') {
    return { pass: true, value };
  }

  const match = value.trim().match(UNIT_REGEX);
  if (!match) {
    // WHY: fallback for range-formatted values ("1-2 in", "100-200 Hz").
    // The main regex requires a leading number, so ranges with embedded
    // separators miss. Try stripping a trailing unit suffix instead.
    return checkTrailingUnit(value.trim(), expectedUnit, appDb);
  }

  const numericPart = Number(match[1]);
  const detectedUnit = (match[2] || '').trim();

  if (!detectedUnit) {
    return { pass: true, value: numericPart, rule: 'strip_same_unit' };
  }

  // WHY: resolveUnit checks: exact canonical → synonyms → cross-unit conversion.
  // Falls back to case-insensitive match for unregistered units.
  const resolved = resolveUnit(detectedUnit, expectedUnit, appDb);

  if (resolved) {
    const convertedValue = resolved.factor === 1
      ? numericPart
      : numericPart * resolved.factor;
    const rule = resolved.factor === 1 ? 'strip_same_unit' : 'unit_converted';
    return { pass: true, value: convertedValue, rule };
  }

  return {
    pass: false,
    reason: `wrong_unit: expected ${expectedUnit}, detected ${detectedUnit}`,
    detail: { expected: expectedUnit, detected: detectedUnit },
  };
}

// WHY: handles range-formatted strings ("1-2 in", "100-200 Hz") that the main
// UNIT_REGEX can't parse. Detects a trailing unit suffix, resolves it, and either
// strips (same unit) or converts (cross-unit) the numeric prefix.
// WHY: prefix must start with a digit so pure-text strings like "hello world"
// don't false-match. Covers "1-2 in", "100-200 Hz", "0.5-1.0 mm".
const TRAILING_UNIT_REGEX = /^(\d[\d.\-\u2013 ]*?)\s+([a-zA-Z%°"\u00b5\u03a9][a-zA-Z0-9 %°"\u00b2\u00b3\u00b5\u03a9/()\-]*)$/;
const RANGE_SEP = /[-\u2013]/;

function checkTrailingUnit(value, expectedUnit, appDb) {
  const trailingMatch = value.match(TRAILING_UNIT_REGEX);
  if (!trailingMatch) {
    return { pass: true, value };
  }

  const prefix = trailingMatch[1].trim();
  const detectedUnit = trailingMatch[2].trim();

  if (!detectedUnit) {
    return { pass: true, value };
  }

  const resolved = resolveUnit(detectedUnit, expectedUnit, appDb);
  if (!resolved) {
    return {
      pass: false,
      reason: `wrong_unit: expected ${expectedUnit}, detected ${detectedUnit}`,
      detail: { expected: expectedUnit, detected: detectedUnit },
    };
  }

  if (resolved.factor === 1) {
    return { pass: true, value: prefix, rule: 'strip_same_unit' };
  }

  // Cross-unit conversion: apply factor to each numeric part in the range
  const parts = prefix.split(RANGE_SEP);
  const converted = parts.map(p => {
    const n = parseFloat(p.trim());
    return Number.isFinite(n) ? n * resolved.factor : p.trim();
  });
  const allNumeric = converted.every(v => typeof v === 'number');
  if (allNumeric) {
    return { pass: true, value: converted.join('-'), rule: 'unit_converted' };
  }

  return { pass: true, value: prefix, rule: 'strip_same_unit' };
}
