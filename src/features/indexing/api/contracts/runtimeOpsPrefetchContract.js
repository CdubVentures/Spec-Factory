// WHY: O(1) Feature Scaling — single source of truth for prefetch builder
// response keys. Shape descriptors for search_profile live in prefetchContract.js
// (SEARCH_PROFILE_SHAPE). This module covers the remaining sub-shapes.

// ── Top-level envelope ──

export const PREFETCH_RESPONSE_KEYS = Object.freeze([
  'needset', 'search_profile', 'llm_calls', 'search_results',
  'brand_resolution', 'search_plans', 'query_journey',
  'search_result_details', 'cross_query_url_counts',
  'serp_selector', 'domain_health',
]);

// ── NeedSet ──

export const NEEDSET_DATA_KEYS = Object.freeze([
  'needset_size', 'total_fields', 'identity_state',
  'fields', 'summary', 'blockers', 'bundles',
  'profile_influence', 'deltas', 'rows',
  'round', 'round_mode', 'schema_version', 'snapshots',
]);

// ── Brand Resolution ──

export const BRAND_RESOLUTION_KEYS = Object.freeze([
  'brand', 'status', 'skip_reason', 'official_domain',
  'aliases', 'support_domain', 'confidence',
  'candidates', 'reasoning',
]);

// ── Search Plans ──

export const SEARCH_PLAN_PASS_KEYS = Object.freeze([
  'pass_index', 'pass_name', 'queries_generated',
  'stop_condition', 'plan_rationale', 'query_target_map',
  'missing_critical_fields', 'mode',
]);

// ── Query Journey ──

export const QUERY_JOURNEY_KEYS = Object.freeze([
  'selected_query_count', 'selected_queries',
  'schema4_query_count', 'deterministic_query_count',
  'host_plan_query_count', 'rejected_count',
]);

// ── Search Results ──

export const SEARCH_RESULT_KEYS = Object.freeze([
  'query', 'provider', 'result_count', 'duration_ms',
  'worker_id', 'throttle_events', 'throttle_wait_ms', 'ts',
]);

// ── Domain Health ──

export const DOMAIN_HEALTH_ROW_KEYS = Object.freeze([
  'domain', 'role', 'safety_class', 'budget_score',
  'cooldown_remaining', 'success_rate', 'avg_latency_ms', 'notes',
]);

// ── Prefetch LLM Call ──

export const PREFETCH_LLM_CALL_KEYS = Object.freeze([
  'status', 'reason', 'model', 'provider', 'tokens',
  'duration_ms', 'prompt_preview', 'response_preview', 'error',
]);
