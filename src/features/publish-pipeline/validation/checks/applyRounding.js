/**
 * Numeric precision enforcement (Step 8).
 * Rounds to declared decimal places. Always repairs, never rejects.
 *
 * @param {*} value - Field value (post-type-check, post-unit-strip)
 * @param {{ decimals?: number, mode?: 'nearest'|'floor'|'ceil' }|null} roundingConfig
 * @returns {{ value: *, repaired: boolean, rule?: string }}
 */
export function applyRounding(value, roundingConfig) {
  if (!roundingConfig || roundingConfig.decimals === undefined || roundingConfig.decimals === null) {
    return { value, repaired: false };
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { value, repaired: false };
  }

  const { decimals, mode = 'nearest' } = roundingConfig;
  const factor = Math.pow(10, decimals);

  let rounded;
  if (mode === 'floor') {
    rounded = Math.floor(value * factor) / factor;
  } else if (mode === 'ceil') {
    rounded = Math.ceil(value * factor) / factor;
  } else {
    rounded = Math.round(value * factor) / factor;
  }

  if (rounded === value) {
    return { value, repaired: false };
  }

  return { value: rounded, repaired: true, rule: 'rounding' };
}
