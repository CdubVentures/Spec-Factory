// WHY: O(1) Feature Scaling — single source of truth for prefetch tab keys
// and LLM reason classification. Backend classifyPrefetchLlmReason() and
// frontend PrefetchTabKey union both derive from these constants.

export const PREFETCH_TAB_KEYS = Object.freeze([
  'needset',
  'search_profile',
  'brand_resolver',
  'search_planner',
  'query_journey',
  'serp_selector',
  'domain_classifier',
  'search_results',
]);

// WHY: Maps raw event reason strings to canonical prefetch tab keys.
// The backend's classifyPrefetchLlmReason() should use this map instead
// of hardcoded if/else chains. Keys are lowercase patterns, values are tab keys.
export const PREFETCH_LLM_REASON_MAP = Object.freeze({
  'brand_resolution': 'brand_resolver',
  'needset_search_planner': 'needset_planner',
  'domain_safety_classification': 'domain_classifier',
});

// WHY: Prefix-match patterns for reason classification (order matters).
export const PREFETCH_LLM_REASON_PREFIX_MAP = Object.freeze([
  { prefix: 'discovery_planner', tabKey: 'search_planner' },
  { prefix: 'search_planner', tabKey: 'search_planner' },
]);

// WHY: Substring-match patterns for reason classification.
export const PREFETCH_LLM_REASON_SUBSTRING_MAP = Object.freeze([
  { substring: 'triage', tabKey: 'serp_selector' },
  { substring: 'rerank', tabKey: 'serp_selector' },
  { substring: 'serp', tabKey: 'serp_selector' },
]);

// WHY: O(1) — canonical set of LLM call group keys used to initialize
// llmGroups in the builder. Derived from the union of all classification
// target values across the reason maps above.
export const PREFETCH_LLM_GROUP_KEYS = Object.freeze([
  'brand_resolver',
  'needset_planner',
  'search_planner',
  'serp_selector',
  'domain_classifier',
]);

// ── Shape descriptors ──
// WHY: O(1) Feature Scaling — each descriptor is a frozen array of { key, coerce }
// tuples defining the canonical field set and coercion strategy for a prefetch
// sub-shape. The builder's projectShape() iterates these instead of hardcoding
// property-by-property mapping. Adding a field = add one entry here.
//
// Coerce types: 'string' | 'int' | 'float' | 'bool' | 'array' |
//               'object_or_null' | 'object_or_empty' | 'passthrough'

export const SEARCH_RESULT_ENTRY_SHAPE = Object.freeze([
  { key: 'title', coerce: 'string' },
  { key: 'url', coerce: 'string' },
  { key: 'domain', coerce: 'string' },
  { key: 'snippet', coerce: 'string' },
  { key: 'rank', coerce: 'int' },
  { key: 'relevance_score', coerce: 'float' },
  { key: 'decision', coerce: 'string' },
  { key: 'reason', coerce: 'string' },
  { key: 'provider', coerce: 'string' },
  { key: 'already_crawled', coerce: 'bool' },
]);

export const SEARCH_RESULT_DETAIL_SHAPE = Object.freeze([
  { key: 'query', coerce: 'string' },
  { key: 'provider', coerce: 'string' },
  { key: 'dedupe_count', coerce: 'int' },
]);

export const SERP_SCORE_COMPONENTS_SHAPE = Object.freeze([
  { key: 'base_relevance', coerce: 'float' },
  { key: 'tier_boost', coerce: 'float' },
  { key: 'identity_match', coerce: 'float' },
  { key: 'penalties', coerce: 'float' },
]);

export const SERP_TRIAGE_CANDIDATE_SHAPE = Object.freeze([
  { key: 'url', coerce: 'string' },
  { key: 'title', coerce: 'string' },
  { key: 'domain', coerce: 'string' },
  { key: 'snippet', coerce: 'string' },
  { key: 'score', coerce: 'float' },
  { key: 'decision', coerce: 'string' },
  { key: 'rationale', coerce: 'string' },
  { key: 'role', coerce: 'string' },
  { key: 'identity_prelim', coerce: 'string' },
  { key: 'host_trust_class', coerce: 'string' },
  { key: 'primary_lane', coerce: 'passthrough' },
  { key: 'triage_disposition', coerce: 'string' },
  { key: 'doc_kind_guess', coerce: 'string' },
  { key: 'approval_bucket', coerce: 'string' },
]);

export const SERP_TRIAGE_ENVELOPE_SHAPE = Object.freeze([
  { key: 'query', coerce: 'string' },
  { key: 'kept_count', coerce: 'int' },
  { key: 'dropped_count', coerce: 'int' },
]);

export const SERP_TRIAGE_FUNNEL_SHAPE = Object.freeze([
  { key: 'raw_input', coerce: 'int' },
  { key: 'hard_drop_count', coerce: 'int' },
  { key: 'candidates_after_hard_drop', coerce: 'int' },
  { key: 'canon_merge_count', coerce: 'int' },
  { key: 'candidates_classified', coerce: 'int' },
  { key: 'candidates_sent_to_llm', coerce: 'int' },
  { key: 'overflow_capped', coerce: 'int' },
  { key: 'llm_model', coerce: 'string' },
  { key: 'llm_applied', coerce: 'bool' },
]);

export const SEARCH_PROFILE_SHAPE = Object.freeze([
  { key: 'query_count', coerce: 'int' },
  { key: 'selected_query_count', coerce: 'int' },
  { key: 'provider', coerce: 'string' },
  { key: 'llm_query_planning', coerce: 'bool' },
  { key: 'llm_query_model', coerce: 'string' },
  { key: 'llm_queries', coerce: 'array' },
  { key: 'identity_aliases', coerce: 'array' },
  { key: 'variant_guard_terms', coerce: 'array' },
  { key: 'focus_fields', coerce: 'array' },
  { key: 'query_rows', coerce: 'array' },
  { key: 'query_guard', coerce: 'object_or_empty' },
  { key: 'hint_source_counts', coerce: 'object_or_empty' },
  { key: 'field_rule_gate_counts', coerce: 'object_or_empty' },
  { key: 'field_rule_hint_counts_by_field', coerce: 'object_or_empty' },
  { key: 'generated_at', coerce: 'string' },
  { key: 'product_id', coerce: 'string' },
  { key: 'source', coerce: 'string' },
  { key: 'query_reject_log', coerce: 'array' },
  { key: 'alias_reject_log', coerce: 'array' },
  { key: 'effective_host_plan', coerce: 'object_or_null' },
  { key: 'brand_resolution', coerce: 'object_or_null' },
  { key: 'base_model', coerce: 'string' },
  { key: 'aliases', coerce: 'array' },
  { key: 'discovered_count', coerce: 'int' },
  { key: 'approved_count', coerce: 'int' },
  { key: 'candidate_count', coerce: 'int' },
  { key: 'llm_serp_selector', coerce: 'bool' },
  { key: 'serp_explorer', coerce: 'object_or_null' },
]);

export const SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE = Object.freeze([
  { key: 'query', coerce: 'string' },
  { key: 'original_query', coerce: 'string' },
  { key: 'hint_source', coerce: 'string' },
  { key: 'tier', coerce: 'string' },
  { key: 'group_key', coerce: 'string' },
  { key: 'target_fields', coerce: 'array', itemType: 'string' },
]);

/**
 * Classify an LLM event reason into a prefetch tab key.
 * Uses contract-defined maps instead of hardcoded strings.
 */
export function classifyPrefetchLlmReason(reason) {
  const r = String(reason || '').trim().toLowerCase();
  if (PREFETCH_LLM_REASON_MAP[r]) return PREFETCH_LLM_REASON_MAP[r];
  for (const { prefix, tabKey } of PREFETCH_LLM_REASON_PREFIX_MAP) {
    if (r.startsWith(prefix)) return tabKey;
  }
  for (const { substring, tabKey } of PREFETCH_LLM_REASON_SUBSTRING_MAP) {
    if (r.includes(substring)) return tabKey;
  }
  return null;
}
