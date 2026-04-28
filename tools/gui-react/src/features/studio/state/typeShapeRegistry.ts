// WHY: Frontend type/shape options derive from the field-rule schema SSOT.
// Type-specific constraints remain local because they encode GUI side effects,
// not authorable option lists.

import { FIELD_RULE_CONTRACT_CONTROLS } from '../../../../../../src/field-rules/fieldRuleSchema.js';

function optionsFor(path: string): readonly string[] {
  const control = FIELD_RULE_CONTRACT_CONTROLS.find((entry) => entry.path === path);
  if (!control?.options) {
    throw new Error(`Missing field-rule contract options for ${path}`);
  }
  return control.options;
}

export const VALID_TYPES = optionsFor('contract.type');
export type FieldType = (typeof VALID_TYPES)[number];

export const VALID_SHAPES = optionsFor('contract.shape');
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
