import { resolveUnit } from '../../../../field-rules/unitRegistry.js';

// WHY: regex captures number + optional unit suffix.
// Handles simple ("42g"), spaced ("42 g"), multi-word ("110 pixels per inch"),
// hyphenated ("60 gram-force"), slash ("500 cd/m2"), and symbol suffixes ("100 °").
// First suffix char must be a letter/symbol (not digit) to avoid ambiguity.
const UNIT_REGEX = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z%°\u00b5\u03a9](?:[a-zA-Z0-9 %°\u00b2\u00b3\u00b5\u03a9/()\-]*[a-zA-Z0-9%°\u00b2\u00b3\u00b5\u03a9)])?)?$/;

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

  if (value === 'unk') {
    return { pass: true, value: 'unk' };
  }

  if (typeof value === 'number') {
    return { pass: true, value };
  }

  if (typeof value !== 'string') {
    return { pass: true, value };
  }

  const match = value.trim().match(UNIT_REGEX);
  if (!match) {
    return { pass: true, value };
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
