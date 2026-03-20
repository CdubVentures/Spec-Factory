// WHY: O(1) Feature Scaling — single source of truth for runtime ops response keys.
// Backend shape contract tests and frontend type alignment tests both derive from
// these constants. Adding a field = add it here + in the builder + in the TS type.

// ── Summary ──

export const SUMMARY_KEYS = Object.freeze([
  'status', 'round', 'phase_cursor', 'boot_step', 'boot_progress',
  'total_fetches', 'total_parses', 'total_llm_calls',
  'error_rate', 'docs_per_min', 'fields_per_min', 'top_blockers',
]);

// ── Documents ──

export const DOCUMENT_ROW_KEYS = Object.freeze([
  'url', 'host', 'status', 'status_code', 'bytes',
  'content_type', 'content_hash', 'dedupe_outcome',
  'parse_method', 'last_event_ts',
]);

export const DOCUMENT_DETAIL_KEYS = Object.freeze([
  'url', 'host', 'timeline', 'status_code', 'bytes',
  'parse_method', 'candidates', 'evidence_chunks',
]);

// ── Metrics Rail ──

export const METRICS_RAIL_KEYS = Object.freeze([
  'pool_metrics', 'quality_metrics', 'failure_metrics',
]);

export const POOL_METRIC_KEYS = Object.freeze([
  'active', 'queued', 'completed', 'failed',
]);

export const QUALITY_METRIC_KEYS = Object.freeze([
  'identity_status', 'acceptance_rate', 'mean_confidence',
]);

export const FAILURE_METRIC_KEYS = Object.freeze([
  'total_fetches', 'fallback_count', 'fallback_rate',
  'blocked_hosts', 'retry_total', 'no_progress_streak',
]);

// ── Fallbacks ──

export const FALLBACK_RESPONSE_KEYS = Object.freeze([
  'events', 'host_profiles',
]);

export const FALLBACK_EVENT_KEYS = Object.freeze([
  'url', 'host', 'from_mode', 'to_mode', 'reason',
  'attempt', 'result', 'elapsed_ms', 'ts',
]);

export const HOST_FALLBACK_PROFILE_KEYS = Object.freeze([
  'host', 'fallback_total', 'success_count', 'success_rate',
  'exhaustion_count', 'blocked_count', 'modes_used',
]);

// ── Queue ──

export const QUEUE_STATE_KEYS = Object.freeze([
  'jobs', 'lane_summary', 'blocked_hosts',
]);

export const QUEUE_JOB_KEYS = Object.freeze([
  'id', 'lane', 'status', 'host', 'url', 'query',
  'reason', 'field_targets', 'cooldown_until', 'created_at', 'transitions',
]);

export const LANE_SUMMARY_KEYS = Object.freeze([
  'lane', 'queued', 'running', 'done', 'failed', 'cooldown',
]);

export const BLOCKED_HOST_KEYS = Object.freeze([
  'host', 'blocked_count', 'threshold', 'removed_count', 'ts',
]);

// ── Pipeline Flow ──

export const PIPELINE_FLOW_KEYS = Object.freeze([
  'stages', 'recent_transitions',
]);

export const PIPELINE_STAGE_KEYS = Object.freeze([
  'name', 'active', 'completed', 'failed',
]);

export const PIPELINE_TRANSITION_KEYS = Object.freeze([
  'url', 'from_stage', 'to_stage', 'ts',
]);

// ── Workers ──

export const WORKER_ROW_BASE_KEYS = Object.freeze([
  'worker_id', 'pool', 'state', 'stage', 'current_url',
  'started_at', 'elapsed_ms', 'last_error', 'retries',
  'fetch_mode', 'docs_processed', 'fields_extracted',
]);

export const WORKER_FETCH_EXTRA_KEYS = Object.freeze([
  'assigned_search_slot', 'assigned_search_attempt_no',
  'assigned_search_worker_id', 'assigned_search_query', 'display_label',
]);

export const WORKER_SEARCH_EXTRA_KEYS = Object.freeze([
  'slot', 'tasks_started', 'tasks_completed',
  'current_query', 'current_provider',
  'zero_result_count', 'avg_result_count', 'avg_duration_ms',
  'last_result_count', 'last_duration_ms',
  'primary_count', 'fallback_count',
]);

export const WORKER_LLM_EXTRA_KEYS = Object.freeze([
  'call_type', 'model', 'provider', 'round',
  'prompt_tokens', 'completion_tokens', 'estimated_cost', 'duration_ms',
  'input_summary', 'output_summary', 'prefetch_tab',
  'prompt_preview', 'response_preview',
]);

// ── Extraction Fields ──

export const EXTRACTION_RESPONSE_KEYS = Object.freeze(['fields']);

export const EXTRACTION_FIELD_KEYS = Object.freeze([
  'field', 'value', 'status', 'confidence', 'method',
  'source_tier', 'source_host', 'refs_count', 'batch_id',
  'round', 'candidates',
]);

export const EXTRACTION_CANDIDATE_KEYS = Object.freeze([
  'value', 'method', 'confidence', 'source_host',
  'source_tier', 'snippet_id', 'quote',
]);

// ── LLM Dashboard ──

export const LLM_DASHBOARD_KEYS = Object.freeze(['calls', 'summary']);

export const LLM_CALL_ROW_KEYS = Object.freeze([
  'index', 'worker_id', 'call_type', 'round', 'model', 'provider',
  'status', 'prompt_tokens', 'completion_tokens', 'total_tokens',
  'estimated_cost', 'estimated_usage', 'duration_ms',
  'prompt_preview', 'response_preview', 'prefetch_tab', 'ts',
]);

export const LLM_DASHBOARD_SUMMARY_KEYS = Object.freeze([
  'total_calls', 'active_calls', 'completed_calls',
  'total_cost_usd', 'total_tokens', 'prompt_tokens', 'completion_tokens',
  'avg_latency_ms', 'rounds', 'calls_in_latest_round',
  'by_model', 'by_call_type',
]);
