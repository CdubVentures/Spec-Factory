// WHY: Single source of truth for valid data types, shapes, and their constraints.
// All downstream consumers (validation pipeline, compiler, engine) import from here.
// O(1) scaling: adding a type = add one entry.

export const VALID_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'url',
  'range',
  'mixed_number_range',
]);

export const VALID_SHAPES = new Set([
  'scalar',
  'list',
]);

// WHY: Some types only make sense with specific shapes.
// boolean is always a single value. range is a single {min, max}.
// mixed_number_range is always a list of numbers and/or ranges.
export const TYPE_SHAPE_CONSTRAINTS = {
  boolean: ['scalar'],
  range: ['scalar'],
  mixed_number_range: ['list'],
};

/**
 * Validates that a type+shape combination is legal.
 * @param {string} type
 * @param {string} shape
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateTypeShapeCombo(type, shape) {
  if (!VALID_TYPES.has(type)) {
    return { valid: false, reason: `unknown type: ${type}` };
  }
  if (!VALID_SHAPES.has(shape)) {
    return { valid: false, reason: `unknown shape: ${shape}` };
  }
  const allowed = TYPE_SHAPE_CONSTRAINTS[type];
  if (allowed && !allowed.includes(shape)) {
    return { valid: false, reason: `${type} requires shape ${allowed.join('|')}, got ${shape}` };
  }
  return { valid: true };
}
