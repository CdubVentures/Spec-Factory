// WHY: Frontend mirror of src/field-rules/typeCoercionRegistry.js.
// O(1): Adding a type = one entry in VALID_TYPES + one optional entry in constraint/coupling maps.
// Do NOT add types here without also adding them to the backend SSOT.

export const VALID_TYPES = ['string', 'number', 'integer', 'boolean', 'date', 'url', 'range', 'mixed_number_range'] as const;
export type FieldType = (typeof VALID_TYPES)[number];

export const VALID_SHAPES = ['scalar', 'list'] as const;
export type FieldShape = (typeof VALID_SHAPES)[number];

// WHY: Some types only make sense with specific shapes.
export const TYPE_SHAPE_CONSTRAINTS: Partial<Record<FieldType, readonly FieldShape[]>> = {
  boolean: ['scalar'],
  range: ['scalar'],
  mixed_number_range: ['list'],
};

export const UNIT_BEARING_TYPES: ReadonlySet<string> = new Set<FieldType>([
  'number', 'integer', 'range', 'mixed_number_range',
]);

// WHY: O(1) coupling map. When user changes contract.type in the studio, these side-effects
// are applied automatically. Adding coupling for a new type = one entry here, not an if/else branch.
export const TYPE_COUPLING_MAP: Partial<Record<FieldType, Record<string, unknown>>> = {
  boolean: { 'enum.policy': 'closed', 'enum.source': 'yes_no', 'contract.shape': 'scalar' },
};

export function isUnitBearingType(type: string): boolean {
  return UNIT_BEARING_TYPES.has(type);
}

export function validateTypeShapeCombo(type: string, shape: string): { valid: boolean; reason?: string } {
  if (!VALID_TYPES.includes(type as FieldType)) {
    return { valid: false, reason: `unknown type: ${type}` };
  }
  if (!VALID_SHAPES.includes(shape as FieldShape)) {
    return { valid: false, reason: `unknown shape: ${shape}` };
  }
  const allowed = TYPE_SHAPE_CONSTRAINTS[type as FieldType];
  if (allowed && !allowed.includes(shape as FieldShape)) {
    return { valid: false, reason: `${type} requires shape ${allowed.join('|')}, got ${shape}` };
  }
  return { valid: true };
}
