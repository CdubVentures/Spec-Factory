export interface StudioSetFieldValueCommand {
  type: 'set-field-value';
  path: string;
  value: unknown;
}

export type StudioRuleCommand = StudioSetFieldValueCommand;

import { TYPE_COUPLING_MAP } from '../state/typeShapeRegistry.ts';
import type { FieldType } from '../state/typeShapeRegistry.ts';
import { getN } from '../state/nestedValueHelpers.ts';
import { applyCascadeEffects } from '../state/fieldCascadeRegistry.ts';

const PRIORITY_SIGNAL_PATHS = new Set([
  'priority.required_level',
  'priority.difficulty',
]);

// WHY: component path sets full object; extract .type for cascade comparison.
const CASCADE_PATH_ALIASES: Record<string, (value: unknown) => { path: string; extracted: unknown }> = {
  'component': (value) => ({
    path: 'component.type',
    extracted: value && typeof value === 'object' ? (value as Record<string, unknown>).type : '',
  }),
};

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
    // WHY: Legacy alias sync for enum_policy/enum_source/shape at top level.
    if (path === 'enum.policy') rule.enum_policy = effectValue;
    if (path === 'enum.source') rule.enum_source = effectValue;
    if (path === 'contract.shape') {
      rule.shape = effectValue;
      rule.output_shape = effectValue;
      rule.value_form = effectValue;
    }
  }
}

function getEffectiveRuleType(rule: Record<string, unknown>): FieldType | '' {
  const candidates = [
    getN(rule, 'contract.type'),
    rule.type,
    rule.data_type,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  if (candidates.includes('boolean')) return 'boolean';
  return (candidates[0] || '') as FieldType | '';
}

export function enforceStudioRuleInvariants(rule: Record<string, unknown>): void {
  const type = getEffectiveRuleType(rule);
  if (!type) return;
  if (type === 'boolean') {
    setNestedRuleValue(rule, 'contract.type', 'boolean');
    applyLegacyAliasCoupling(rule, 'contract.type', 'boolean');
  }
  applyTypeCoupling(rule, type);
}

// WHY: AI assist mode/budget knobs retired. Auto-note generation removed.
// Users set extraction guidance manually via ai_assist.reasoning_note.
function applyPrioritySignalCoupling(_rule: Record<string, unknown>): void {
  // no-op after knob retirement
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

  // WHY: Capture previous values before mutation for cascade comparison.
  const prevValues: Record<string, unknown> = {
    'contract.type': getN(rule, 'contract.type'),
    'contract.shape': getN(rule, 'contract.shape'),
    'component.type': getN(rule, 'component.type'),
    'priority.required_level': getN(rule, 'priority.required_level'),
  };

  setNestedRuleValue(rule, normalizedPath, command.value);
  applyLegacyAliasCoupling(rule, normalizedPath, command.value);

  if (normalizedPath === 'contract.type') {
    applyTypeCoupling(rule, command.value);
  }

  if (PRIORITY_SIGNAL_PATHS.has(normalizedPath)) {
    applyPrioritySignalCoupling(rule);
  }

  // WHY: Generic cascade engine replaces per-path manual coupling.
  // All cascade rules live in fieldCascadeRegistry.ts (O(1) scaling).
  let cascadePath = normalizedPath;
  let cascadeNewVal: unknown = command.value;
  const alias = CASCADE_PATH_ALIASES[normalizedPath];
  if (alias) {
    const resolved = alias(command.value);
    cascadePath = resolved.path;
    cascadeNewVal = resolved.extracted;
  }
  const prevVal = prevValues[cascadePath];
  applyCascadeEffects(rule, cascadePath, prevVal, cascadeNewVal);

  // WHY: Legacy alias sync for cascade-derived enum changes.
  const postEnumSource = getN(rule, 'enum.source');
  const postEnumPolicy = getN(rule, 'enum.policy');
  if (postEnumSource !== undefined) rule.enum_source = postEnumSource;
  if (postEnumPolicy !== undefined) rule.enum_policy = postEnumPolicy;

  enforceStudioRuleInvariants(rule);

  rule._edited = true;
}
