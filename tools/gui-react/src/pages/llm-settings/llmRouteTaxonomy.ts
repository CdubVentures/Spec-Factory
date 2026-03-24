// WHY: LLM route-specific taxonomy. Core enum registries now live in
// registries/fieldRuleTaxonomy.ts (SSOT). This file re-exports them
// and adds LLM-specific sort/prompt/chip utilities.

import type { LlmRouteRow } from '../../types/llmSettings.ts';
import { toEffortBand, EFFORT_BOUNDS } from './llmRouteDomain.ts';

// ── Re-export core registries from SSOT ─────────────────────────────
export {
  REQUIRED_LEVEL_OPTIONS,
  REQUIRED_LEVEL_RANK,
  DIFFICULTY_OPTIONS,
  DIFFICULTY_RANK,
  AVAILABILITY_OPTIONS,
  AVAILABILITY_RANK,
  AI_MODE_OPTIONS,
  AI_MODEL_STRATEGY_OPTIONS,
  ENUM_POLICY_OPTIONS,
  tagCls,
} from '../../registries/fieldRuleTaxonomy.ts';

import {
  REQUIRED_LEVEL_RANK,
  DIFFICULTY_RANK,
  AVAILABILITY_RANK,
} from '../../registries/fieldRuleTaxonomy.ts';

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

// --- Prompt flag fields (derived from registry via codegen) ---

import { LLM_ROUTE_PROMPT_FLAG_KEYS } from '../../types/llmRouteTypes.generated.ts';

export const PROMPT_FLAG_FIELDS: Array<keyof LlmRouteRow> = [...LLM_ROUTE_PROMPT_FLAG_KEYS];

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
