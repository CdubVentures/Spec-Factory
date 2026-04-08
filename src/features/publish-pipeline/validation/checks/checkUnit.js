// WHY: regex captures number + optional unit suffix.
// Handles: "42", "42g", "42 g", "120 mm", "42.5 ms", "-3.2 g", "500 mAh"
const UNIT_REGEX = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z%°]+\s*[a-zA-Z]*)?$/;

/**
 * Unit verification (Step 3). Verifies and optionally converts.
 * @param {*} value - Field value (post-type-check)
 * @param {string} expectedUnit - from contract.unit
 * @param {string[]} [unitAccepts] - from parse.unit_accepts (falls back to [expectedUnit])
 * @param {Record<string, number>|null} [unitConversions] - from parse.unit_conversions (factor to multiply)
 * @param {boolean} [strictUnitRequired=false] - from parse.strict_unit_required
 * @returns {{ pass: boolean, value?: *, rule?: string, reason?: string, detail?: { expected: string, detected: string } }}
 */
export function checkUnit(value, expectedUnit, unitAccepts, unitConversions, strictUnitRequired) {
  if (!expectedUnit) {
    return { pass: true, value };
  }

  if (value === 'unk') {
    return { pass: true, value: 'unk' };
  }

  // WHY: When strict_unit_required is true, a bare number with no unit suffix must be rejected.
  if (strictUnitRequired && typeof value === 'number') {
    return {
      pass: false,
      reason: `unit_required: bare number ${value} missing required unit ${expectedUnit}`,
      detail: { expected: expectedUnit, detected: '' },
    };
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
    // WHY: Bare numeric string "42" — reject if strict_unit_required, else strip and pass.
    if (strictUnitRequired) {
      return {
        pass: false,
        reason: `unit_required: "${value}" missing required unit ${expectedUnit}`,
        detail: { expected: expectedUnit, detected: '' },
      };
    }
    return { pass: true, value: numericPart, rule: 'strip_same_unit' };
  }

  const accepts = unitAccepts && unitAccepts.length > 0
    ? unitAccepts
    : [expectedUnit];

  const detectedLower = detectedUnit.toLowerCase();
  const isAccepted = accepts.some(u => u.toLowerCase() === detectedLower);

  if (isAccepted) {
    return { pass: true, value: numericPart, rule: 'strip_same_unit' };
  }

  // WHY: Attempt deterministic conversion before rejecting.
  if (unitConversions && typeof unitConversions === 'object') {
    const factor = unitConversions[detectedUnit] || unitConversions[detectedLower];
    if (typeof factor === 'number' && Number.isFinite(factor)) {
      return { pass: true, value: numericPart * factor, rule: 'unit_convert' };
    }
  }

  return {
    pass: false,
    reason: `wrong_unit: expected ${expectedUnit}, detected ${detectedUnit}`,
    detail: { expected: expectedUnit, detected: detectedUnit },
  };
}
