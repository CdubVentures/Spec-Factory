
import type { LlmScope } from './llmSettings.ts';
// AUTO-GENERATED from LLM_ROUTE_COLUMN_REGISTRY — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmRouteTypes.js

export const LLM_ROUTE_COLUMN_KEYS = ['scope', 'route_key', 'required_level', 'difficulty', 'availability', 'effort', 'effort_band', 'single_source_data', 'all_source_data', 'enable_websearch', 'model_ladder_today', 'all_sources_confidence_repatch', 'max_tokens', 'studio_key_navigation_sent_in_extract_review', 'studio_contract_rules_sent_in_extract_review', 'studio_extraction_guidance_sent_in_extract_review', 'studio_tooltip_or_description_sent_when_present', 'studio_enum_options_sent_when_present', 'studio_component_variance_constraints_sent_in_component_review', 'studio_parse_template_sent_direct_in_extract_review', 'studio_ai_mode_difficulty_effort_sent_direct_in_extract_review', 'studio_required_level_sent_in_extract_review', 'studio_component_entity_set_sent_when_component_field', 'studio_evidence_policy_sent_direct_in_extract_review', 'studio_variance_policy_sent_in_component_review', 'studio_constraints_sent_in_component_review', 'studio_send_booleans_prompted_to_model', 'scalar_linked_send', 'component_values_send', 'list_values_send', 'llm_output_min_evidence_refs_required', 'insufficient_evidence_action'] as const;
export type LlmRouteColumnKey = typeof LLM_ROUTE_COLUMN_KEYS[number];

export const LLM_ROUTE_BOOLEAN_COLUMN_KEYS = ['single_source_data', 'all_source_data', 'enable_websearch', 'all_sources_confidence_repatch', 'studio_key_navigation_sent_in_extract_review', 'studio_contract_rules_sent_in_extract_review', 'studio_extraction_guidance_sent_in_extract_review', 'studio_tooltip_or_description_sent_when_present', 'studio_enum_options_sent_when_present', 'studio_component_variance_constraints_sent_in_component_review', 'studio_parse_template_sent_direct_in_extract_review', 'studio_ai_mode_difficulty_effort_sent_direct_in_extract_review', 'studio_required_level_sent_in_extract_review', 'studio_component_entity_set_sent_when_component_field', 'studio_evidence_policy_sent_direct_in_extract_review', 'studio_variance_policy_sent_in_component_review', 'studio_constraints_sent_in_component_review', 'studio_send_booleans_prompted_to_model'] as const;
export type LlmRouteBooleanKey = typeof LLM_ROUTE_BOOLEAN_COLUMN_KEYS[number];

export const LLM_ROUTE_PROMPT_FLAG_KEYS = ['studio_key_navigation_sent_in_extract_review', 'studio_contract_rules_sent_in_extract_review', 'studio_extraction_guidance_sent_in_extract_review', 'studio_tooltip_or_description_sent_when_present', 'studio_enum_options_sent_when_present', 'studio_component_variance_constraints_sent_in_component_review', 'studio_parse_template_sent_direct_in_extract_review', 'studio_ai_mode_difficulty_effort_sent_direct_in_extract_review', 'studio_required_level_sent_in_extract_review', 'studio_component_entity_set_sent_when_component_field', 'studio_evidence_policy_sent_direct_in_extract_review', 'studio_variance_policy_sent_in_component_review', 'studio_constraints_sent_in_component_review', 'studio_send_booleans_prompted_to_model'] as const;
export type LlmRoutePromptFlagKey = typeof LLM_ROUTE_PROMPT_FLAG_KEYS[number];

export interface LlmRouteRow {
  id?: number;
  category?: string;
  scope: LlmScope;
  route_key: string;
  required_level: string;
  difficulty: string;
  availability: string;
  effort: number;
  effort_band: string;
  single_source_data: boolean;
  all_source_data: boolean;
  enable_websearch: boolean;
  model_ladder_today: string;
  all_sources_confidence_repatch: boolean;
  max_tokens: number;
  studio_key_navigation_sent_in_extract_review: boolean;
  studio_contract_rules_sent_in_extract_review: boolean;
  studio_extraction_guidance_sent_in_extract_review: boolean;
  studio_tooltip_or_description_sent_when_present: boolean;
  studio_enum_options_sent_when_present: boolean;
  studio_component_variance_constraints_sent_in_component_review: boolean;
  studio_parse_template_sent_direct_in_extract_review: boolean;
  studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: boolean;
  studio_required_level_sent_in_extract_review: boolean;
  studio_component_entity_set_sent_when_component_field: boolean;
  studio_evidence_policy_sent_direct_in_extract_review: boolean;
  studio_variance_policy_sent_in_component_review: boolean;
  studio_constraints_sent_in_component_review: boolean;
  studio_send_booleans_prompted_to_model: boolean;
  scalar_linked_send: string;
  component_values_send: string;
  list_values_send: string;
  llm_output_min_evidence_refs_required: number;
  insufficient_evidence_action: string;
}
