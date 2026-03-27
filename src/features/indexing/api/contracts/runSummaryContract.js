// WHY: O(1) Feature Scaling — single source of truth for run-summary.json shape.
// run-summary.json captures all run telemetry (GUI dashboard data) at finalize.
// Product knowledge (needset, search_profile, brand_resolution) stays in SQL.
// This file defines the canonical shape so serializer + deserializer + tests
// all derive from the same constants.

export const RUN_SUMMARY_SCHEMA_VERSION = 1;

// ── Telemetry Meta (mirrors writeRunMeta doc assembly) ──

export const RUN_SUMMARY_META_SHAPE = Object.freeze([
  { key: 'run_id', coerce: 'string' },
  { key: 'category', coerce: 'string' },
  { key: 'product_id', coerce: 'string' },
  { key: 'status', coerce: 'string' },
  { key: 'started_at', coerce: 'string' },
  { key: 'ended_at', coerce: 'string' },
  { key: 'phase_cursor', coerce: 'string' },
  { key: 'boot_step', coerce: 'string', optional: true },
  { key: 'boot_progress', coerce: 'int', optional: true },
  { key: 'identity_fingerprint', coerce: 'string' },
  { key: 'identity_lock_status', coerce: 'string' },
  { key: 'dedupe_mode', coerce: 'string' },
  { key: 's3key', coerce: 'string', optional: true },
  { key: 'out_root', coerce: 'string', optional: true },
  { key: 'counters', coerce: 'object' },
  { key: 'stages', coerce: 'object' },
  { key: 'startup_ms', coerce: 'object' },
  { key: 'browser_pool', coerce: 'object', nullable: true },
  { key: 'needset_summary', coerce: 'object', nullable: true },
  { key: 'search_profile_summary', coerce: 'object', nullable: true },
  { key: 'artifacts', coerce: 'object' },
]);
export const RUN_SUMMARY_META_KEYS = Object.freeze(RUN_SUMMARY_META_SHAPE.map(s => s.key));

// ── Bridge Event Row (same shape as getBridgeEventsByRunId returns) ──

export const RUN_SUMMARY_EVENT_SHAPE = Object.freeze([
  { key: 'run_id', coerce: 'string' },
  { key: 'category', coerce: 'string' },
  { key: 'product_id', coerce: 'string' },
  { key: 'ts', coerce: 'string' },
  { key: 'stage', coerce: 'string' },
  { key: 'event', coerce: 'string' },
  { key: 'payload', coerce: 'object' },
]);
export const RUN_SUMMARY_EVENT_KEYS = Object.freeze(RUN_SUMMARY_EVENT_SHAPE.map(s => s.key));

// ── LLM Aggregates (from bridge._llmTracker.getLlmAgg()) ──

export const RUN_SUMMARY_LLM_AGG_SHAPE = Object.freeze([
  { key: 'total_calls', coerce: 'int' },
  { key: 'completed_calls', coerce: 'int' },
  { key: 'failed_calls', coerce: 'int' },
  { key: 'active_calls', coerce: 'int' },
  { key: 'total_prompt_tokens', coerce: 'int' },
  { key: 'total_completion_tokens', coerce: 'int' },
  { key: 'total_cost', coerce: 'float' },
  { key: 'calls_by_type', coerce: 'object' },
  { key: 'calls_by_model', coerce: 'object' },
]);
export const RUN_SUMMARY_LLM_AGG_KEYS = Object.freeze(RUN_SUMMARY_LLM_AGG_SHAPE.map(s => s.key));

// ── Observability Counters (from bridge.getObservability()) ──

export const RUN_SUMMARY_OBSERVABILITY_SHAPE = Object.freeze([
  { key: 'search_finish_without_start', coerce: 'int' },
  { key: 'search_slot_reuse', coerce: 'int' },
  { key: 'search_unique_slots', coerce: 'int' },
  { key: 'llm_missing_telemetry', coerce: 'int' },
  { key: 'llm_orphan_finish', coerce: 'int' },
  { key: 'bridge_event_errors', coerce: 'int' },
  { key: 'bridge_finalize_errors', coerce: 'int' },
]);
export const RUN_SUMMARY_OBSERVABILITY_KEYS = Object.freeze(RUN_SUMMARY_OBSERVABILITY_SHAPE.map(s => s.key));

// ── Top-Level Envelope ──

export const RUN_SUMMARY_TOP_KEYS = Object.freeze([
  'schema_version',
  'telemetry',
]);

export const RUN_SUMMARY_TELEMETRY_KEYS = Object.freeze([
  'meta',
  'events',
  'llm_agg',
  'observability',
]);
