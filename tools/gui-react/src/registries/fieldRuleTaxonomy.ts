// WHY: Field-rule enum values come from the backend field-rule schema registry.
// This file owns GUI-only rank/chip presentation metadata for those values.

import {
  FIELD_RULE_PRIORITY_CONTROLS,
  FIELD_RULE_SCHEMA,
} from '../../../../src/field-rules/fieldRuleSchema.js';

// ── Registries ──────────────────────────────────────────────────────────

function priorityOptions(path: string): readonly string[] {
  return FIELD_RULE_PRIORITY_CONTROLS.find((entry) => entry.path === path)?.options ?? [];
}

function schemaOptions(path: string): readonly string[] {
  return FIELD_RULE_SCHEMA.find((entry) => entry.path === path)?.options ?? [];
}

const REQUIRED_LEVEL_META: Record<string, { rank: number; chip: string }> = {
  mandatory: { rank: 2, chip: 'sf-chip-danger' },
  non_mandatory: { rank: 1, chip: 'sf-chip-neutral' },
};

const DIFFICULTY_META: Record<string, { rank: number; chip: string }> = {
  very_hard: { rank: 4, chip: 'sf-chip-danger' },
  hard: { rank: 3, chip: 'sf-chip-warning' },
  medium: { rank: 2, chip: 'sf-chip-info' },
  easy: { rank: 1, chip: 'sf-chip-success' },
};

const AVAILABILITY_META: Record<string, { rank: number; chip: string }> = {
  always: { rank: 3, chip: 'sf-chip-success' },
  sometimes: { rank: 2, chip: 'sf-chip-warning' },
  rare: { rank: 1, chip: 'sf-chip-neutral' },
};

const REQUIRED_LEVEL_REGISTRY = priorityOptions('priority.required_level')
  .map((value) => ({ value, ...REQUIRED_LEVEL_META[value] }));

const DIFFICULTY_REGISTRY = priorityOptions('priority.difficulty')
  .map((value) => ({ value, ...DIFFICULTY_META[value] }));

const AVAILABILITY_REGISTRY = priorityOptions('priority.availability')
  .map((value) => ({ value, ...AVAILABILITY_META[value] }));

const AI_MODE_REGISTRY = [
  { value: 'off',      rank: 0 },
  { value: 'advisory', rank: 1 },
  { value: 'planner',  rank: 2 },
  { value: 'judge',    rank: 3 },
] as const;

const AI_MODEL_STRATEGY_REGISTRY = [
  { value: 'auto',       rank: 0 },
  { value: 'force_fast', rank: 1 },
  { value: 'force_deep', rank: 2 },
] as const;

const ENUM_POLICY_REGISTRY = schemaOptions('enum.policy').map((value) => ({ value }));

// ── Derived option arrays ───────────────────────────────────────────────

export const REQUIRED_LEVEL_OPTIONS = REQUIRED_LEVEL_REGISTRY.map((e) => e.value);
export const DIFFICULTY_OPTIONS = DIFFICULTY_REGISTRY.map((e) => e.value);
export const AVAILABILITY_OPTIONS = AVAILABILITY_REGISTRY.map((e) => e.value);
export const AI_MODE_OPTIONS = AI_MODE_REGISTRY.map((e) => e.value);
export const AI_MODEL_STRATEGY_OPTIONS = AI_MODEL_STRATEGY_REGISTRY.map((e) => e.value);
export const ENUM_POLICY_OPTIONS = ENUM_POLICY_REGISTRY.map((e) => e.value);

// ── Derived rank maps ───────────────────────────────────────────────────

export const REQUIRED_LEVEL_RANK: Record<string, number> = Object.fromEntries(
  REQUIRED_LEVEL_REGISTRY.map((e) => [e.value, e.rank]),
);
export const DIFFICULTY_RANK: Record<string, number> = Object.fromEntries(
  DIFFICULTY_REGISTRY.map((e) => [e.value, e.rank]),
);
export const AVAILABILITY_RANK: Record<string, number> = Object.fromEntries(
  AVAILABILITY_REGISTRY.map((e) => [e.value, e.rank]),
);

// ── Chip classification ─────────────────────────────────────────────────

const REQUIRED_LEVEL_CHIP: Record<string, string> = Object.fromEntries(
  REQUIRED_LEVEL_REGISTRY.map((e) => [e.value, e.chip]),
);
const DIFFICULTY_CHIP: Record<string, string> = Object.fromEntries(
  DIFFICULTY_REGISTRY.map((e) => [e.value, e.chip]),
);
const AVAILABILITY_CHIP: Record<string, string> = Object.fromEntries(
  AVAILABILITY_REGISTRY.map((e) => [e.value, e.chip]),
);

export function tagCls(kind: 'required' | 'difficulty' | 'availability', value: string): string {
  if (kind === 'required') return REQUIRED_LEVEL_CHIP[value] || 'sf-chip-neutral';
  if (kind === 'difficulty') return DIFFICULTY_CHIP[value] || 'sf-chip-neutral';
  if (kind === 'availability') return AVAILABILITY_CHIP[value] || 'sf-chip-neutral';
  return 'sf-chip-neutral';
}
