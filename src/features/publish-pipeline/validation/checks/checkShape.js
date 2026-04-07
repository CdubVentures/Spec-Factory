/**
 * Shape validation (Step 1). Short-circuits pipeline on failure.
 * @param {*} value - Field value (post-absence-normalization)
 * @param {'scalar'|'list'|'record'} expectedShape
 * @returns {{ pass: boolean, reason?: string }}
 */
export function checkShape(value, expectedShape) {
  if (expectedShape === 'scalar') {
    if (value === null || value === undefined) {
      return { pass: false, reason: 'expected scalar, got null/undefined' };
    }
    if (Array.isArray(value)) {
      return { pass: false, reason: 'expected scalar, got array' };
    }
    if (typeof value === 'object') {
      return { pass: false, reason: 'expected scalar, got object' };
    }
    return { pass: true };
  }

  if (expectedShape === 'list') {
    if (!Array.isArray(value)) {
      return { pass: false, reason: `expected array, got ${typeof value}` };
    }
    return { pass: true };
  }

  if (expectedShape === 'record') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { pass: false, reason: 'expected object/record' };
    }
    return { pass: true };
  }

  return { pass: false, reason: `unknown shape: ${expectedShape}` };
}
