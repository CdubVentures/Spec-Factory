export interface StudioSetFieldValueCommand {
  type: 'set-field-value';
  path: string;
  value: unknown;
}

export type StudioRuleCommand = StudioSetFieldValueCommand;

const COMPONENT_TEMPLATE_TYPES: Record<string, string> = {
  sensor: 'sensor',
  switch: 'switch',
  encoder: 'encoder',
  material: 'material',
};

import { TYPE_COUPLING_MAP, isUnitBearingType } from '../state/typeShapeRegistry.ts';
import type { FieldType } from '../state/typeShapeRegistry.ts';

const PRIORITY_SIGNAL_PATHS = new Set([
  'priority.required_level',
  'priority.difficulty',
  'priority.effort',
]);

export function createSetFieldValueCommand(
  path: string,
  value: unknown,
): StudioSetFieldValueCommand {
  return {
    type: 'set-field-value',
    path: String(path || '').trim(),
    value,
  };
}

export function setNestedRuleValue(
  rule: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): void {
  const parts = String(dotPath || '').split('.');
  if (parts.length === 1) {
    rule[parts[0]] = value;
    return;
  }
  if (parts.length === 2) {
    const parent = { ...((rule[parts[0]] || {}) as Record<string, unknown>) };
    parent[parts[1]] = value;
    rule[parts[0]] = parent;
    return;
  }
  if (parts.length === 3) {
    const parent = { ...((rule[parts[0]] || {}) as Record<string, unknown>) };
    const child = { ...((parent[parts[1]] || {}) as Record<string, unknown>) };
    child[parts[2]] = value;
    parent[parts[1]] = child;
    rule[parts[0]] = parent;
  }
}

function applyLegacyAliasCoupling(
  rule: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  if (path === 'contract.type') {
    rule.type = value;
    rule.data_type = value;
  }
  if (path === 'contract.shape') {
    rule.shape = value;
    rule.output_shape = value;
    rule.value_form = value;
  }
  if (path === 'contract.unit') rule.unit = value;
  if (path === 'priority.required_level') rule.required_level = value;
  if (path === 'priority.availability') rule.availability = value;
  if (path === 'priority.difficulty') rule.difficulty = value;
  if (path === 'priority.effort') rule.effort = value;
  if (path === 'evidence.min_evidence_refs') rule.min_evidence_refs = value;
  if (path === 'enum.policy') rule.enum_policy = value;
  if (path === 'enum.source') rule.enum_source = value;
  // WHY: parse.template eliminated. No legacy alias sync needed.
  if (path === 'ui.group') rule.group = value;
  if (path === 'ui.label') rule.display_name = value;
}

// WHY: O(1) type-driven coupling. When contract.type changes, apply side-effects from TYPE_COUPLING_MAP.
// Adding coupling for a new type = one entry in the map, not a new if/else branch.
function applyTypeCoupling(rule: Record<string, unknown>, value: unknown): void {
  const type = String(value || '') as FieldType;
  const effects = TYPE_COUPLING_MAP[type];
  if (!effects) return;
  for (const [path, effectValue] of Object.entries(effects)) {
    setNestedRuleValue(rule, path, effectValue);
    // WHY: Legacy alias sync for enum_policy/enum_source at top level.
    if (path === 'enum.policy') rule.enum_policy = effectValue;
    if (path === 'enum.source') rule.enum_source = effectValue;
  }
}

// WHY: AI assist mode/budget knobs retired. Auto-note generation removed.
// Users set extraction guidance manually via ai_assist.reasoning_note.
function applyPrioritySignalCoupling(_rule: Record<string, unknown>): void {
  // no-op after knob retirement
}

function applyComponentTypeCoupling(
  rule: Record<string, unknown>,
  value: unknown,
): void {
  const componentType = String(value || '');
  if (!componentType) return;
  setNestedRuleValue(rule, 'enum.source', `component_db.${componentType}`);
  rule.enum_source = `component_db.${componentType}`;
}

export function applyStudioRuleCommand({
  rule,
  key,
  command,
}: {
  rule: Record<string, unknown>;
  key: string;
  command: StudioRuleCommand;
}): void {
  if (command.type !== 'set-field-value') return;

  const normalizedPath = String(command.path || '').trim();
  setNestedRuleValue(rule, normalizedPath, command.value);
  applyLegacyAliasCoupling(rule, normalizedPath, command.value);

  if (normalizedPath === 'contract.type') {
    applyTypeCoupling(rule, command.value);
  }

  if (PRIORITY_SIGNAL_PATHS.has(normalizedPath)) {
    applyPrioritySignalCoupling(rule);
  }

  if (normalizedPath === 'component.type') {
    applyComponentTypeCoupling(rule, command.value);
  }

  rule._edited = true;
}
