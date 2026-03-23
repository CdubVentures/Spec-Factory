// WHY: O(1) Feature Scaling — single source of truth for prefetch builder
// response shapes. Shape descriptors carry type info ({key, coerce}) enabling
// codegen of TS interfaces. Shape descriptors for search_profile live in
// prefetchContract.js (SEARCH_PROFILE_SHAPE). This module covers the rest.

// ── Top-level envelope ──

export const PREFETCH_RESPONSE_KEYS = Object.freeze([
  'needset', 'search_profile', 'llm_calls', 'search_results',
  'brand_resolution', 'search_plans', 'query_journey',
  'search_result_details', 'cross_query_url_counts',
  'serp_selector', 'domain_health',
]);

// ── NeedSet ──

export const NEEDSET_DATA_SHAPE = Object.freeze([
  { key: 'needset_size', coerce: 'int' },
  { key: 'total_fields', coerce: 'int' },
  { key: 'identity_state', coerce: 'string', nullable: true },
  { key: 'fields', coerce: 'array' },
  { key: 'summary', coerce: 'object_or_empty' },
  { key: 'blockers', coerce: 'object_or_empty' },
  { key: 'bundles', coerce: 'array' },
  { key: 'profile_influence', coerce: 'object_or_null' },
  { key: 'deltas', coerce: 'array' },
  { key: 'rows', coerce: 'array' },
  { key: 'round', coerce: 'int' },
  { key: 'schema_version', coerce: 'string', nullable: true },
  { key: 'snapshots', coerce: 'array' },
]);
export const NEEDSET_DATA_KEYS = Object.freeze(NEEDSET_DATA_SHAPE.map(s => s.key));

// ── Brand Resolution ──

export const BRAND_RESOLUTION_SHAPE = Object.freeze([
  { key: 'brand', coerce: 'string' },
  { key: 'status', coerce: 'string', optional: true },
  { key: 'skip_reason', coerce: 'string', optional: true },
  { key: 'official_domain', coerce: 'string' },
  { key: 'aliases', coerce: 'array', itemType: 'string' },
  { key: 'support_domain', coerce: 'string' },
  { key: 'confidence', coerce: 'float', nullable: true },
  { key: 'candidates', coerce: 'array', optional: true },
  { key: 'reasoning', coerce: 'array', itemType: 'string', optional: true },
]);
export const BRAND_RESOLUTION_KEYS = Object.freeze(BRAND_RESOLUTION_SHAPE.map(s => s.key));

// ── Search Plans ──

export const SEARCH_PLAN_PASS_SHAPE = Object.freeze([
  { key: 'pass_index', coerce: 'int' },
  { key: 'pass_name', coerce: 'string' },
  { key: 'queries_generated', coerce: 'array' },
  { key: 'stop_condition', coerce: 'string' },
  { key: 'plan_rationale', coerce: 'string' },
  { key: 'query_target_map', coerce: 'object_or_empty' },
  { key: 'missing_critical_fields', coerce: 'array' },
  { key: 'mode', coerce: 'string' },
]);
export const SEARCH_PLAN_PASS_KEYS = Object.freeze(SEARCH_PLAN_PASS_SHAPE.map(s => s.key));

// ── Query Journey ──

export const QUERY_JOURNEY_SHAPE = Object.freeze([
  { key: 'selected_query_count', coerce: 'int' },
  { key: 'selected_queries', coerce: 'array' },
  { key: 'schema4_query_count', coerce: 'int' },
  { key: 'deterministic_query_count', coerce: 'int' },
  { key: 'host_plan_query_count', coerce: 'int' },
  { key: 'rejected_count', coerce: 'int' },
]);
export const QUERY_JOURNEY_KEYS = Object.freeze(QUERY_JOURNEY_SHAPE.map(s => s.key));

// ── Search Results ──

export const SEARCH_RESULT_SHAPE = Object.freeze([
  { key: 'query', coerce: 'string' },
  { key: 'provider', coerce: 'string' },
  { key: 'result_count', coerce: 'int' },
  { key: 'duration_ms', coerce: 'int' },
  { key: 'worker_id', coerce: 'string' },
  { key: 'throttle_events', coerce: 'int', optional: true },
  { key: 'throttle_wait_ms', coerce: 'int', optional: true },
  { key: 'ts', coerce: 'string' },
]);
export const SEARCH_RESULT_KEYS = Object.freeze(SEARCH_RESULT_SHAPE.map(s => s.key));

// ── Domain Health ──

export const DOMAIN_HEALTH_ROW_SHAPE = Object.freeze([
  { key: 'domain', coerce: 'string' },
  { key: 'role', coerce: 'string' },
  { key: 'safety_class', coerce: 'string' },
  { key: 'budget_score', coerce: 'float' },
  { key: 'cooldown_remaining', coerce: 'int' },
  { key: 'success_rate', coerce: 'float' },
  { key: 'avg_latency_ms', coerce: 'float' },
  { key: 'notes', coerce: 'string' },
]);
export const DOMAIN_HEALTH_ROW_KEYS = Object.freeze(DOMAIN_HEALTH_ROW_SHAPE.map(s => s.key));

// ── Prefetch LLM Call ──

export const PREFETCH_LLM_CALL_SHAPE = Object.freeze([
  { key: 'status', coerce: 'string', literals: ['finished', 'failed', 'running'] },
  { key: 'reason', coerce: 'string' },
  { key: 'model', coerce: 'string' },
  { key: 'provider', coerce: 'string' },
  { key: 'tokens', coerce: 'object_or_empty' },
  { key: 'duration_ms', coerce: 'int' },
  { key: 'prompt_preview', coerce: 'string', nullable: true },
  { key: 'response_preview', coerce: 'string', nullable: true },
  { key: 'error', coerce: 'string', nullable: true },
]);
export const PREFETCH_LLM_CALL_KEYS = Object.freeze(PREFETCH_LLM_CALL_SHAPE.map(s => s.key));
