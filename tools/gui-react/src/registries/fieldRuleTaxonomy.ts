// WHY: Single Source of Truth for all field-rule enum values, ranks, and chip
// classifications. Every dropdown, badge, sort, and validation in the frontend
// must derive from these registries. Adding a new enum value = add one entry here.

// ── Registries ──────────────────────────────────────────────────────────

const REQUIRED_LEVEL_REGISTRY = [
  { value: 'mandatory',     rank: 2, chip: 'sf-chip-danger' },
  { value: 'non_mandatory', rank: 1, chip: 'sf-chip-neutral' },
] as const;

const DIFFICULTY_REGISTRY = [
  { value: 'very_hard', rank: 4, chip: 'sf-chip-danger' },
  { value: 'hard',      rank: 3, chip: 'sf-chip-warning' },
  { value: 'medium',    rank: 2, chip: 'sf-chip-info' },
  { value: 'easy',      rank: 1, chip: 'sf-chip-success' },
] as const;

const AVAILABILITY_REGISTRY = [
  { value: 'always',    rank: 3, chip: 'sf-chip-success' },
  { value: 'sometimes', rank: 2, chip: 'sf-chip-warning' },
  { value: 'rare',      rank: 1, chip: 'sf-chip-neutral' },
] as const;

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

const ENUM_POLICY_REGISTRY = [
  { value: 'open' },
  { value: 'closed' },
  { value: 'open_prefer_known' },
] as const;

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
