// WHY: regex captures number + optional unit suffix.
// Handles: "42", "42g", "42 g", "120 mm", "42.5 ms", "-3.2 g", "500 mAh"
const UNIT_REGEX = /^(-?\d+(?:\.\d+)?)\s*([a-zA-Z%°]+\s*[a-zA-Z]*)?$/;

/**
 * Unit verification (Step 3). Verifies, does NOT convert.
 * @param {*} value - Field value (post-type-check)
 * @param {string} expectedUnit - from contract.unit
 * @param {string[]} [unitAccepts] - from parse.unit_accepts (falls back to [expectedUnit])
 * @returns {{ pass: boolean, value?: *, rule?: string, reason?: string, detail?: { expected: string, detected: string } }}
 */
export function checkUnit(value, expectedUnit, unitAccepts) {
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

  const accepts = unitAccepts && unitAccepts.length > 0
    ? unitAccepts
    : [expectedUnit];

  const detectedLower = detectedUnit.toLowerCase();
  const isAccepted = accepts.some(u => u.toLowerCase() === detectedLower);

  if (isAccepted) {
    return { pass: true, value: numericPart, rule: 'strip_same_unit' };
  }

  return {
    pass: false,
    reason: `wrong_unit: expected ${expectedUnit}, detected ${detectedUnit}`,
    detail: { expected: expectedUnit, detected: detectedUnit },
  };
}
