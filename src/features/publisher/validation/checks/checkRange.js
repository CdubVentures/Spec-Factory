/**
 * Numeric bounds enforcement (Step 9).
 * Rejects out-of-range values. Does not clamp — rejection only.
 *
 * @param {*} value - Field value (post-rounding)
 * @param {{ min?: number, max?: number }|null} rangeConfig - from contract.range
 * @returns {{ pass: boolean, reason?: string, detail?: { min?: number, max?: number, actual: number } }}
 */
export function checkRange(value, rangeConfig) {
  if (!rangeConfig) return { pass: true };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { pass: true };

  const { min, max } = rangeConfig;
  const hasMin = typeof min === 'number' && Number.isFinite(min);
  const hasMax = typeof max === 'number' && Number.isFinite(max);

  if (!hasMin && !hasMax) return { pass: true };

  if (hasMin && value < min) {
    return {
      pass: false,
      reason: `out_of_range: ${value} < min ${min}`,
      detail: { ...(hasMin ? { min } : {}), ...(hasMax ? { max } : {}), actual: value },
    };
  }

  if (hasMax && value > max) {
    return {
      pass: false,
      reason: `out_of_range: ${value} > max ${max}`,
      detail: { ...(hasMin ? { min } : {}), ...(hasMax ? { max } : {}), actual: value },
    };
  }

  return { pass: true };
}
