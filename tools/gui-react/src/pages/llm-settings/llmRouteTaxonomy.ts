import type { LlmRouteRow } from '../../types/llmSettings.ts';
import { toEffortBand, EFFORT_BOUNDS } from './llmRouteDomain.ts';

// --- Taxonomy registries (SSOT for each dimension) ---

const REQUIRED_LEVEL_REGISTRY = [
  { value: 'identity',  rank: 7 },
  { value: 'critical',  rank: 6 },
  { value: 'required',  rank: 5 },
  { value: 'expected',  rank: 4 },
  { value: 'optional',  rank: 3 },
  { value: 'editorial', rank: 2 },
  { value: 'commerce',  rank: 1 },
] as const;

const DIFFICULTY_REGISTRY = [
  { value: 'instrumented', rank: 4 },
  { value: 'hard',         rank: 3 },
  { value: 'medium',       rank: 2 },
  { value: 'easy',         rank: 1 },
] as const;

const AVAILABILITY_REGISTRY = [
  { value: 'always',        rank: 5 },
  { value: 'expected',      rank: 4 },
  { value: 'sometimes',     rank: 3 },
  { value: 'rare',          rank: 2 },
  { value: 'editorial_only', rank: 1 },
] as const;

// --- Derived rank maps ---

export const REQUIRED_LEVEL_RANK: Record<string, number> = Object.fromEntries(
  REQUIRED_LEVEL_REGISTRY.map((e) => [e.value, e.rank])
);
export const DIFFICULTY_RANK: Record<string, number> = Object.fromEntries(
  DIFFICULTY_REGISTRY.map((e) => [e.value, e.rank])
);
export const AVAILABILITY_RANK: Record<string, number> = Object.fromEntries(
  AVAILABILITY_REGISTRY.map((e) => [e.value, e.rank])
);

// --- Derived option arrays (for dropdowns) ---

export const REQUIRED_LEVEL_OPTIONS = REQUIRED_LEVEL_REGISTRY.map((e) => e.value);
export const DIFFICULTY_OPTIONS = DIFFICULTY_REGISTRY.map((e) => e.value);
export const AVAILABILITY_OPTIONS = AVAILABILITY_REGISTRY.map((e) => e.value);

// --- Sort types ---

export type SortBy = 'route_key' | 'required_level' | 'difficulty' | 'availability' | 'effort';
export const SORT_BY_KEYS = [
  'route_key',
  'required_level',
  'difficulty',
  'availability',
  'effort',
] as const satisfies ReadonlyArray<SortBy>;
export const SORT_DIR_KEYS = ['asc', 'desc'] as const;

// --- Prompt flag fields ---

export const PROMPT_FLAG_FIELDS: Array<keyof LlmRouteRow> = [
  'studio_key_navigation_sent_in_extract_review',
  'studio_contract_rules_sent_in_extract_review',
  'studio_extraction_guidance_sent_in_extract_review',
  'studio_tooltip_or_description_sent_when_present',
  'studio_enum_options_sent_when_present',
  'studio_component_variance_constraints_sent_in_component_review',
  'studio_parse_template_sent_direct_in_extract_review',
  'studio_ai_mode_difficulty_effort_sent_direct_in_extract_review',
  'studio_required_level_sent_in_extract_review',
  'studio_component_entity_set_sent_when_component_field',
  'studio_evidence_policy_sent_direct_in_extract_review',
  'studio_variance_policy_sent_in_component_review',
  'studio_constraints_sent_in_component_review',
  'studio_send_booleans_prompted_to_model'
];

// --- Enum option arrays for inline dropdowns ---

export const CONTEXT_PACK_OPTIONS = ['standard', 'minimal', 'full'] as const;
export const SCALAR_SEND_OPTIONS = ['scalar value', 'scalar value + prime sources'] as const;
export const COMPONENT_SEND_OPTIONS = ['component values', 'component values + prime sources'] as const;
export const LIST_SEND_OPTIONS = ['list values', 'list values prime sources'] as const;
export const INSUFFICIENT_EVIDENCE_OPTIONS = ['threshold_unmet', 'return_unk', 'escalate'] as const;

// --- Sort dispatch ---

export function rankForSort(row: LlmRouteRow, sortBy: SortBy): number | string {
  if (sortBy === 'effort') return row.effort;
  if (sortBy === 'required_level') return REQUIRED_LEVEL_RANK[row.required_level] || 0;
  if (sortBy === 'difficulty') return DIFFICULTY_RANK[row.difficulty] || 0;
  if (sortBy === 'availability') return AVAILABILITY_RANK[row.availability] || 0;
  return row.route_key;
}

// --- Chip classification ---

export function tagCls(kind: 'required' | 'difficulty' | 'availability' | 'effort', value: string) {
  if (kind === 'required') {
    if (['identity', 'critical', 'required'].includes(value)) return 'sf-chip-danger';
    if (value === 'expected') return 'sf-chip-info';
    return 'sf-chip-neutral';
  }
  if (kind === 'difficulty') {
    if (value === 'hard' || value === 'instrumented') return 'sf-chip-warning';
    if (value === 'medium') return 'sf-chip-info';
    return 'sf-chip-success';
  }
  if (kind === 'availability') {
    if (value === 'always' || value === 'expected') return 'sf-chip-success';
    if (value === 'sometimes') return 'sf-chip-warning';
    return 'sf-chip-neutral';
  }
  const parsedEffort = Number.parseInt(String(value || ''), 10);
  const effortBand = toEffortBand(Number.isFinite(parsedEffort) ? parsedEffort : EFFORT_BOUNDS.min);
  if (effortBand === '1-3') return 'sf-chip-success';
  if (effortBand === '4-6') return 'sf-chip-info';
  if (effortBand === '7-8') return 'sf-chip-warning';
  return 'sf-chip-danger';
}
