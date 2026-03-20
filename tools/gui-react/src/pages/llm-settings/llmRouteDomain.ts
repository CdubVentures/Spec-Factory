import type { LlmRouteRow } from '../../types/llmSettings.ts';
import { LLM_SETTING_LIMITS, LLM_ROUTE_PRESET_LIMITS } from '../../stores/llmSettingsManifest.ts';
import type { LlmRoutePresetConfig } from '../../stores/llmSettingsManifest.ts';
import { PROMPT_FLAG_FIELDS } from './llmRouteTaxonomy.ts';

export const EFFORT_BOUNDS = LLM_SETTING_LIMITS.effort;
export const MAX_TOKEN_BOUNDS = LLM_SETTING_LIMITS.maxTokens;
export const MIN_EVIDENCE_BOUNDS = LLM_SETTING_LIMITS.minEvidenceRefs;
export const MAX_TOKEN_STEP = MAX_TOKEN_BOUNDS.step ?? 1;

export function clampToRange(value: number, min: number, max: number) {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, safeValue));
}

export function toEffortBand(effort: number) {
  const parsedEffort = Number.isFinite(effort) ? effort : EFFORT_BOUNDS.min;
  const n = clampToRange(parsedEffort, EFFORT_BOUNDS.min, EFFORT_BOUNDS.max);
  if (n <= 3) return '1-3';
  if (n <= 6) return '4-6';
  if (n <= 8) return '7-8';
  return '9-10';
}

export function rowEffortBand(row: Pick<LlmRouteRow, 'effort'>) {
  return toEffortBand(row.effort);
}

export function normalizeRowEffortBand(row: LlmRouteRow): LlmRouteRow {
  const normalizedBand = rowEffortBand(row);
  if (row.effort_band === normalizedBand) return row;
  return {
    ...row,
    effort_band: normalizedBand,
  };
}

export function normalizeRowsEffortBand(rows: LlmRouteRow[]) {
  return rows.map((row) => normalizeRowEffortBand(row));
}

export function applyContextPack(row: LlmRouteRow, pack: 'minimal' | 'standard' | 'full') {
  const next = { ...row };
  if (pack === 'minimal') {
    for (const key of PROMPT_FLAG_FIELDS) next[key] = false as never;
    next.studio_key_navigation_sent_in_extract_review = true;
    next.studio_contract_rules_sent_in_extract_review = true;
    next.studio_parse_template_sent_direct_in_extract_review = true;
    next.studio_required_level_sent_in_extract_review = true;
    next.studio_evidence_policy_sent_direct_in_extract_review = true;
    next.studio_send_booleans_prompted_to_model = false;
    return next;
  }
  if (pack === 'full') {
    for (const key of PROMPT_FLAG_FIELDS) next[key] = true as never;
    next.studio_send_booleans_prompted_to_model = false;
    return next;
  }
  for (const key of PROMPT_FLAG_FIELDS) next[key] = true as never;
  next.studio_component_variance_constraints_sent_in_component_review = row.scope === 'component';
  next.studio_variance_policy_sent_in_component_review = row.scope === 'component';
  next.studio_constraints_sent_in_component_review = row.scope === 'component';
  next.studio_component_entity_set_sent_when_component_field = row.scope === 'component';
  next.studio_send_booleans_prompted_to_model = false;
  return next;
}

export function rowDefaultsComparable(row: LlmRouteRow) {
  return {
    scope: row.scope,
    required_level: row.required_level,
    difficulty: row.difficulty,
    availability: row.availability,
    effort: row.effort,
    effort_band: row.effort_band,
    single_source_data: row.single_source_data,
    all_source_data: row.all_source_data,
    enable_websearch: row.enable_websearch,
    model_ladder_today: row.model_ladder_today,
    all_sources_confidence_repatch: row.all_sources_confidence_repatch,
    max_tokens: row.max_tokens,
    studio_key_navigation_sent_in_extract_review: row.studio_key_navigation_sent_in_extract_review,
    studio_contract_rules_sent_in_extract_review: row.studio_contract_rules_sent_in_extract_review,
    studio_extraction_guidance_sent_in_extract_review: row.studio_extraction_guidance_sent_in_extract_review,
    studio_tooltip_or_description_sent_when_present: row.studio_tooltip_or_description_sent_when_present,
    studio_enum_options_sent_when_present: row.studio_enum_options_sent_when_present,
    studio_component_variance_constraints_sent_in_component_review: row.studio_component_variance_constraints_sent_in_component_review,
    studio_parse_template_sent_direct_in_extract_review: row.studio_parse_template_sent_direct_in_extract_review,
    studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: row.studio_ai_mode_difficulty_effort_sent_direct_in_extract_review,
    studio_required_level_sent_in_extract_review: row.studio_required_level_sent_in_extract_review,
    studio_component_entity_set_sent_when_component_field: row.studio_component_entity_set_sent_when_component_field,
    studio_evidence_policy_sent_direct_in_extract_review: row.studio_evidence_policy_sent_direct_in_extract_review,
    studio_variance_policy_sent_in_component_review: row.studio_variance_policy_sent_in_component_review,
    studio_constraints_sent_in_component_review: row.studio_constraints_sent_in_component_review,
    studio_send_booleans_prompted_to_model: row.studio_send_booleans_prompted_to_model,
    scalar_linked_send: row.scalar_linked_send,
    component_values_send: row.component_values_send,
    list_values_send: row.list_values_send,
    llm_output_min_evidence_refs_required: row.llm_output_min_evidence_refs_required,
    insufficient_evidence_action: row.insufficient_evidence_action
  };
}

export function applyRoutePreset(row: LlmRouteRow, preset: 'balanced' | 'deep') {
  const presetConfig: LlmRoutePresetConfig = LLM_ROUTE_PRESET_LIMITS[preset];
  if (preset === 'balanced') {
    return {
      ...row,
      single_source_data: presetConfig.singleSourceData,
      all_source_data: row.required_level === 'required' || row.required_level === 'critical' || row.difficulty === 'hard',
      enable_websearch: row.availability === 'rare' || row.difficulty === 'hard' || row.required_level === 'critical' || row.required_level === 'identity',
      all_sources_confidence_repatch: presetConfig.allSourcesConfidenceRepatch,
      model_ladder_today: row.model_ladder_today || presetConfig.modelLadderToday,
      max_tokens: clampToRange(row.max_tokens, presetConfig.maxTokensMin, presetConfig.maxTokensMax),
    };
  }
  return {
    ...row,
    single_source_data: presetConfig.singleSourceData,
    all_source_data: row.required_level === 'required' || row.required_level === 'critical' || row.difficulty === 'hard',
    enable_websearch: row.availability === 'rare' || row.difficulty === 'hard' || row.required_level === 'critical' || row.required_level === 'identity',
    all_sources_confidence_repatch: presetConfig.allSourcesConfidenceRepatch,
    model_ladder_today: row.model_ladder_today || presetConfig.modelLadderToday,
    max_tokens: clampToRange(row.max_tokens, presetConfig.maxTokensMin, presetConfig.maxTokensMax),
    llm_output_min_evidence_refs_required: clampToRange(
      Math.max(
        presetConfig.minEvidenceRefsRequired ?? MIN_EVIDENCE_BOUNDS.min,
        row.llm_output_min_evidence_refs_required ?? MIN_EVIDENCE_BOUNDS.min,
      ),
      MIN_EVIDENCE_BOUNDS.min,
      MIN_EVIDENCE_BOUNDS.max,
    ),
  };
}
