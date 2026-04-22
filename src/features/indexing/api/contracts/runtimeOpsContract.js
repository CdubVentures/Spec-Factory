// WHY: O(1) Feature Scaling — single source of truth for runtime ops response shapes.
// Shape descriptors carry type info ({key, coerce}) enabling codegen of TS interfaces.
// Backend shape contract tests and frontend type alignment tests both derive from
// these constants. Adding a field = add it here + in the builder + run codegen.

// ── Summary ──

export const SUMMARY_SHAPE = Object.freeze([
  { key: 'status', coerce: 'string' },
  { key: 'round', coerce: 'int' },
  { key: 'stage_cursor', coerce: 'string', optional: true },
  { key: 'boot_step', coerce: 'string', optional: true },
  { key: 'boot_progress', coerce: 'int', optional: true },
  { key: 'total_fetches', coerce: 'int' },
  { key: 'total_parses', coerce: 'int' },
  { key: 'total_llm_calls', coerce: 'int' },
  { key: 'error_rate', coerce: 'float' },
  { key: 'docs_per_min', coerce: 'float' },
  { key: 'fields_per_min', coerce: 'float' },
  { key: 'top_blockers', coerce: 'array', itemRef: 'RuntimeOpsBlocker' },
  { key: 'browser_pool', coerce: 'object', nullable: true, optional: true },
]);
export const SUMMARY_KEYS = Object.freeze(SUMMARY_SHAPE.map(s => s.key));

export const BLOCKER_SHAPE = Object.freeze([
  { key: 'host', coerce: 'string' },
  { key: 'error_count', coerce: 'int' },
]);

// ── Documents ──

export const DOCUMENT_ROW_SHAPE = Object.freeze([
  { key: 'url', coerce: 'string' },
  { key: 'host', coerce: 'string' },
  { key: 'status', coerce: 'string' },
  { key: 'status_code', coerce: 'int', nullable: true },
  { key: 'bytes', coerce: 'int', nullable: true },
  { key: 'content_type', coerce: 'string', nullable: true },
  { key: 'content_hash', coerce: 'string', nullable: true },
  { key: 'dedupe_outcome', coerce: 'string', nullable: true },
  { key: 'parse_method', coerce: 'string', nullable: true },
  { key: 'last_event_ts', coerce: 'string' },
]);
export const DOCUMENT_ROW_KEYS = Object.freeze(DOCUMENT_ROW_SHAPE.map(s => s.key));

export const DOCUMENT_DETAIL_SHAPE = Object.freeze([
  { key: 'url', coerce: 'string' },
  { key: 'host', coerce: 'string' },
  { key: 'timeline', coerce: 'array' },
  { key: 'status_code', coerce: 'int', nullable: true },
  { key: 'bytes', coerce: 'int', nullable: true },
  { key: 'parse_method', coerce: 'string', nullable: true },
  { key: 'candidates', coerce: 'int', nullable: true },
  { key: 'evidence_chunks', coerce: 'int', nullable: true },
]);
export const DOCUMENT_DETAIL_KEYS = Object.freeze(DOCUMENT_DETAIL_SHAPE.map(s => s.key));

// ── Metrics Rail ──

export const METRICS_RAIL_KEYS = Object.freeze([
  'pool_metrics', 'quality_metrics', 'failure_metrics', 'crawl_engine',
]);

export const POOL_METRIC_SHAPE = Object.freeze([
  { key: 'active', coerce: 'int' },
  { key: 'queued', coerce: 'int' },
  { key: 'completed', coerce: 'int' },
  { key: 'failed', coerce: 'int' },
]);
export const POOL_METRIC_KEYS = Object.freeze(POOL_METRIC_SHAPE.map(s => s.key));

export const QUALITY_METRIC_SHAPE = Object.freeze([
  { key: 'identity_status', coerce: 'string' },
  { key: 'acceptance_rate', coerce: 'float' },
  { key: 'mean_confidence', coerce: 'float' },
]);
export const QUALITY_METRIC_KEYS = Object.freeze(QUALITY_METRIC_SHAPE.map(s => s.key));

export const FAILURE_METRIC_SHAPE = Object.freeze([
  { key: 'total_fetches', coerce: 'int' },
  { key: 'fallback_count', coerce: 'int' },
  { key: 'fallback_rate', coerce: 'float' },
  { key: 'blocked_hosts', coerce: 'int' },
  { key: 'retry_total', coerce: 'int' },
  { key: 'no_progress_streak', coerce: 'int' },
]);
export const FAILURE_METRIC_KEYS = Object.freeze(FAILURE_METRIC_SHAPE.map(s => s.key));

// ── Fallbacks ──

export const FALLBACK_RESPONSE_KEYS = Object.freeze([
  'events', 'host_profiles',
]);

export const FALLBACK_EVENT_SHAPE = Object.freeze([
  { key: 'url', coerce: 'string' },
  { key: 'host', coerce: 'string' },
  { key: 'from_mode', coerce: 'string' },
  { key: 'to_mode', coerce: 'string' },
  { key: 'reason', coerce: 'string' },
  { key: 'attempt', coerce: 'int' },
  { key: 'result', coerce: 'string', literals: ['pending', 'succeeded', 'exhausted', 'failed'] },
  { key: 'elapsed_ms', coerce: 'int' },
  { key: 'ts', coerce: 'string' },
]);
export const FALLBACK_EVENT_KEYS = Object.freeze(FALLBACK_EVENT_SHAPE.map(s => s.key));

export const HOST_FALLBACK_PROFILE_SHAPE = Object.freeze([
  { key: 'host', coerce: 'string' },
  { key: 'fallback_total', coerce: 'int' },
  { key: 'success_count', coerce: 'int' },
  { key: 'success_rate', coerce: 'float' },
  { key: 'exhaustion_count', coerce: 'int' },
  { key: 'blocked_count', coerce: 'int' },
  { key: 'modes_used', coerce: 'array', itemType: 'string' },
]);
export const HOST_FALLBACK_PROFILE_KEYS = Object.freeze(HOST_FALLBACK_PROFILE_SHAPE.map(s => s.key));

// ── Queue ──

export const QUEUE_STATE_KEYS = Object.freeze([
  'jobs', 'lane_summary', 'blocked_hosts',
]);

export const QUEUE_JOB_SHAPE = Object.freeze([
  { key: 'id', coerce: 'string' },
  { key: 'lane', coerce: 'string' },
  { key: 'status', coerce: 'string', literals: ['queued', 'running', 'done', 'failed', 'cooldown'] },
  { key: 'host', coerce: 'string' },
  { key: 'url', coerce: 'string' },
  { key: 'query', coerce: 'string', nullable: true },
  { key: 'reason', coerce: 'string' },
  { key: 'field_targets', coerce: 'array', itemType: 'string' },
  { key: 'cooldown_until', coerce: 'string', nullable: true },
  { key: 'created_at', coerce: 'string' },
  { key: 'transitions', coerce: 'array' },
]);
export const QUEUE_JOB_KEYS = Object.freeze(QUEUE_JOB_SHAPE.map(s => s.key));

export const LANE_SUMMARY_SHAPE = Object.freeze([
  { key: 'lane', coerce: 'string' },
  { key: 'queued', coerce: 'int' },
  { key: 'running', coerce: 'int' },
  { key: 'done', coerce: 'int' },
  { key: 'failed', coerce: 'int' },
  { key: 'cooldown', coerce: 'int' },
]);
export const LANE_SUMMARY_KEYS = Object.freeze(LANE_SUMMARY_SHAPE.map(s => s.key));

export const BLOCKED_HOST_SHAPE = Object.freeze([
  { key: 'host', coerce: 'string' },
  { key: 'blocked_count', coerce: 'int' },
  { key: 'threshold', coerce: 'int' },
  { key: 'removed_count', coerce: 'int' },
  { key: 'ts', coerce: 'string' },
]);
export const BLOCKED_HOST_KEYS = Object.freeze(BLOCKED_HOST_SHAPE.map(s => s.key));

// ── Pipeline Flow ──

export const PIPELINE_FLOW_KEYS = Object.freeze([
  'stages', 'recent_transitions',
]);

export const PIPELINE_STAGE_SHAPE = Object.freeze([
  { key: 'name', coerce: 'string' },
  { key: 'active', coerce: 'int' },
  { key: 'completed', coerce: 'int' },
  { key: 'failed', coerce: 'int' },
]);
export const PIPELINE_STAGE_KEYS = Object.freeze(PIPELINE_STAGE_SHAPE.map(s => s.key));

export const PIPELINE_TRANSITION_SHAPE = Object.freeze([
  { key: 'url', coerce: 'string' },
  { key: 'from_stage', coerce: 'string' },
  { key: 'to_stage', coerce: 'string' },
  { key: 'ts', coerce: 'string' },
]);
export const PIPELINE_TRANSITION_KEYS = Object.freeze(PIPELINE_TRANSITION_SHAPE.map(s => s.key));

// ── Workers ──

export const WORKER_ROW_BASE_SHAPE = Object.freeze([
  { key: 'worker_id', coerce: 'string' },
  { key: 'pool', coerce: 'string' },
  { key: 'state', coerce: 'string', literals: ['idle', 'running', 'stuck', 'queued', 'crawling', 'crawled', 'retrying', 'failed', 'skipped'] },
  { key: 'stage', coerce: 'string', literals: ['search', 'fetch', 'parse', 'index', 'llm'] },
  { key: 'current_url', coerce: 'string' },
  { key: 'started_at', coerce: 'string' },
  { key: 'elapsed_ms', coerce: 'int' },
  { key: 'last_error', coerce: 'string', nullable: true },
  { key: 'proxy_url', coerce: 'string', nullable: true },
  { key: 'bright_data_unlocked', coerce: 'bool' },
  { key: 'retries', coerce: 'int' },
  { key: 'fetch_mode', coerce: 'string', nullable: true },
  { key: 'docs_processed', coerce: 'int' },
  { key: 'fields_extracted', coerce: 'int' },
]);
export const WORKER_ROW_BASE_KEYS = Object.freeze(WORKER_ROW_BASE_SHAPE.map(s => s.key));

export const WORKER_FETCH_EXTRA_SHAPE = Object.freeze([
  { key: 'assigned_search_slot', coerce: 'string', nullable: true },
  { key: 'assigned_search_attempt_no', coerce: 'int', nullable: true },
  { key: 'assigned_search_worker_id', coerce: 'string', nullable: true },
  { key: 'assigned_search_query', coerce: 'string', nullable: true },
  { key: 'display_label', coerce: 'string', nullable: true },
]);
export const WORKER_FETCH_EXTRA_KEYS = Object.freeze(WORKER_FETCH_EXTRA_SHAPE.map(s => s.key));

export const WORKER_SEARCH_EXTRA_SHAPE = Object.freeze([
  { key: 'slot', coerce: 'string', nullable: true },
  { key: 'tasks_started', coerce: 'int' },
  { key: 'tasks_completed', coerce: 'int' },
  { key: 'current_query', coerce: 'string', nullable: true },
  { key: 'current_provider', coerce: 'string', nullable: true },
  { key: 'zero_result_count', coerce: 'int' },
  { key: 'avg_result_count', coerce: 'float' },
  { key: 'avg_duration_ms', coerce: 'float' },
  { key: 'last_result_count', coerce: 'int' },
  { key: 'last_duration_ms', coerce: 'float' },
  { key: 'primary_count', coerce: 'int' },
  { key: 'fallback_count', coerce: 'int' },
]);
export const WORKER_SEARCH_EXTRA_KEYS = Object.freeze(WORKER_SEARCH_EXTRA_SHAPE.map(s => s.key));

export const WORKER_LLM_EXTRA_SHAPE = Object.freeze([
  { key: 'call_type', coerce: 'string', nullable: true },
  { key: 'model', coerce: 'string', nullable: true },
  { key: 'provider', coerce: 'string', nullable: true },
  { key: 'round', coerce: 'int', nullable: true },
  { key: 'prompt_tokens', coerce: 'int', nullable: true },
  { key: 'completion_tokens', coerce: 'int', nullable: true },
  { key: 'estimated_cost', coerce: 'float', nullable: true },
  { key: 'duration_ms', coerce: 'int', nullable: true },
  { key: 'input_summary', coerce: 'string', nullable: true },
  { key: 'output_summary', coerce: 'string', nullable: true },
  { key: 'prefetch_tab', coerce: 'string', nullable: true },
  { key: 'prompt_preview', coerce: 'string', nullable: true },
  { key: 'response_preview', coerce: 'string', nullable: true },
  { key: 'is_fallback', coerce: 'bool' },
  { key: 'is_lab', coerce: 'bool' },
]);
export const WORKER_LLM_EXTRA_KEYS = Object.freeze(WORKER_LLM_EXTRA_SHAPE.map(s => s.key));

// ── Extraction Fields ──

export const EXTRACTION_RESPONSE_KEYS = Object.freeze(['fields']);

export const EXTRACTION_FIELD_SHAPE = Object.freeze([
  { key: 'field', coerce: 'string' },
  { key: 'value', coerce: 'string', nullable: true },
  { key: 'status', coerce: 'string', literals: ['accepted', 'conflict', 'candidate', 'unknown'] },
  { key: 'confidence', coerce: 'float' },
  { key: 'method', coerce: 'string' },
  { key: 'source_tier', coerce: 'int', nullable: true },
  { key: 'source_host', coerce: 'string' },
  { key: 'refs_count', coerce: 'int' },
  { key: 'batch_id', coerce: 'string', nullable: true },
  { key: 'round', coerce: 'int' },
  { key: 'candidates', coerce: 'array', itemRef: 'ExtractionCandidate' },
]);
export const EXTRACTION_FIELD_KEYS = Object.freeze(EXTRACTION_FIELD_SHAPE.map(s => s.key));

export const EXTRACTION_CANDIDATE_SHAPE = Object.freeze([
  { key: 'value', coerce: 'string' },
  { key: 'method', coerce: 'string' },
  { key: 'confidence', coerce: 'float' },
  { key: 'source_host', coerce: 'string' },
  { key: 'source_tier', coerce: 'int' },
  { key: 'snippet_id', coerce: 'string', nullable: true },
  { key: 'quote', coerce: 'string', nullable: true },
]);
export const EXTRACTION_CANDIDATE_KEYS = Object.freeze(EXTRACTION_CANDIDATE_SHAPE.map(s => s.key));

// ── LLM Dashboard ──

export const LLM_DASHBOARD_KEYS = Object.freeze(['calls', 'summary']);

export const LLM_CALL_ROW_SHAPE = Object.freeze([
  { key: 'index', coerce: 'int' },
  { key: 'worker_id', coerce: 'string' },
  { key: 'call_type', coerce: 'string' },
  { key: 'round', coerce: 'int' },
  { key: 'model', coerce: 'string' },
  { key: 'provider', coerce: 'string' },
  { key: 'status', coerce: 'string', literals: ['active', 'done', 'failed'] },
  { key: 'prompt_tokens', coerce: 'int' },
  { key: 'completion_tokens', coerce: 'int' },
  { key: 'total_tokens', coerce: 'int' },
  { key: 'estimated_cost', coerce: 'float' },
  { key: 'estimated_usage', coerce: 'bool', optional: true },
  { key: 'duration_ms', coerce: 'int', nullable: true },
  { key: 'prompt_preview', coerce: 'string', nullable: true },
  { key: 'response_preview', coerce: 'string', nullable: true },
  { key: 'prefetch_tab', coerce: 'string', nullable: true },
  { key: 'is_fallback', coerce: 'bool' },
  { key: 'is_lab', coerce: 'bool' },
  { key: 'primary_duration_ms', coerce: 'int', nullable: true },
  { key: 'ts', coerce: 'string' },
]);
export const LLM_CALL_ROW_KEYS = Object.freeze(LLM_CALL_ROW_SHAPE.map(s => s.key));

export const LLM_DASHBOARD_SUMMARY_SHAPE = Object.freeze([
  { key: 'total_calls', coerce: 'int' },
  { key: 'active_calls', coerce: 'int' },
  { key: 'completed_calls', coerce: 'int' },
  { key: 'total_cost_usd', coerce: 'float' },
  { key: 'total_tokens', coerce: 'int' },
  { key: 'prompt_tokens', coerce: 'int' },
  { key: 'completion_tokens', coerce: 'int' },
  { key: 'avg_latency_ms', coerce: 'float' },
  { key: 'rounds', coerce: 'int' },
  { key: 'calls_in_latest_round', coerce: 'int' },
  { key: 'by_model', coerce: 'array' },
  { key: 'by_call_type', coerce: 'array' },
]);
export const LLM_DASHBOARD_SUMMARY_KEYS = Object.freeze(LLM_DASHBOARD_SUMMARY_SHAPE.map(s => s.key));

export const LLM_CALL_STATUS_VALUES = Object.freeze(['active', 'done', 'failed']);
