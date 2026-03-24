// WHY: O(1) Feature Scaling — single source of truth for automation queue response shapes.
// Shape descriptors carry type info ({key, coerce}) enabling codegen of TS interfaces.
// Backend builder shape tests and frontend type alignment tests both derive from
// these constants. Adding a field = add it here + run codegen. Zero manual TS edits.

// ── Job Row ──

export const AUTOMATION_JOB_SHAPE = Object.freeze([
  { key: 'job_id', coerce: 'string' },
  { key: 'job_type', coerce: 'string' },
  { key: 'priority', coerce: 'int' },
  { key: 'status', coerce: 'string', literals: ['queued', 'running', 'done', 'failed', 'cooldown'] },
  { key: 'category', coerce: 'string' },
  { key: 'product_id', coerce: 'string' },
  { key: 'run_id', coerce: 'string' },
  { key: 'field_targets', coerce: 'array', itemType: 'string' },
  { key: 'url', coerce: 'string', nullable: true },
  { key: 'domain', coerce: 'string', nullable: true },
  { key: 'query', coerce: 'string', nullable: true },
  { key: 'provider', coerce: 'string', nullable: true },
  { key: 'doc_hint', coerce: 'string', nullable: true },
  { key: 'dedupe_key', coerce: 'string' },
  { key: 'source_signal', coerce: 'string' },
  { key: 'scheduled_at', coerce: 'string', nullable: true },
  { key: 'started_at', coerce: 'string', nullable: true },
  { key: 'finished_at', coerce: 'string', nullable: true },
  { key: 'next_run_at', coerce: 'string', nullable: true },
  { key: 'attempt_count', coerce: 'int' },
  { key: 'reason_tags', coerce: 'array', itemType: 'string' },
  { key: 'last_error', coerce: 'string', nullable: true },
  { key: 'notes', coerce: 'array', itemType: 'string' },
]);
export const AUTOMATION_JOB_KEYS = Object.freeze(AUTOMATION_JOB_SHAPE.map(s => s.key));

// ── Action Row ──

export const AUTOMATION_ACTION_SHAPE = Object.freeze([
  { key: 'ts', coerce: 'string', nullable: true },
  { key: 'event', coerce: 'string', nullable: true },
  { key: 'job_id', coerce: 'string' },
  { key: 'job_type', coerce: 'string' },
  { key: 'status', coerce: 'string', literals: ['queued', 'running', 'done', 'failed', 'cooldown'] },
  { key: 'source_signal', coerce: 'string' },
  { key: 'priority', coerce: 'int' },
  { key: 'detail', coerce: 'string', nullable: true },
  { key: 'domain', coerce: 'string', nullable: true },
  { key: 'url', coerce: 'string', nullable: true },
  { key: 'query', coerce: 'string', nullable: true },
  { key: 'field_targets', coerce: 'array', itemType: 'string' },
  { key: 'reason_tags', coerce: 'array', itemType: 'string' },
]);
export const AUTOMATION_ACTION_KEYS = Object.freeze(AUTOMATION_ACTION_SHAPE.map(s => s.key));

// ── Summary ──

export const AUTOMATION_SUMMARY_SHAPE = Object.freeze([
  { key: 'total_jobs', coerce: 'int' },
  { key: 'queue_depth', coerce: 'int' },
  { key: 'active_jobs', coerce: 'int' },
  { key: 'queued', coerce: 'int' },
  { key: 'running', coerce: 'int' },
  { key: 'done', coerce: 'int' },
  { key: 'failed', coerce: 'int' },
  { key: 'cooldown', coerce: 'int' },
  { key: 'repair_search', coerce: 'int' },
  { key: 'staleness_refresh', coerce: 'int' },
  { key: 'deficit_rediscovery', coerce: 'int' },
  { key: 'domain_backoff', coerce: 'int' },
]);
export const AUTOMATION_SUMMARY_KEYS = Object.freeze(AUTOMATION_SUMMARY_SHAPE.map(s => s.key));

// ── Response Envelope ──

export const AUTOMATION_RESPONSE_KEYS = Object.freeze([
  'generated_at', 'run_id', 'category', 'product_id',
  'summary', 'policies', 'jobs', 'actions',
]);

export const AUTOMATION_STATUS_VALUES = Object.freeze([
  'queued', 'running', 'done', 'failed', 'cooldown',
]);

export const AUTOMATION_JOB_TYPE_VALUES = Object.freeze([
  'repair_search', 'staleness_refresh', 'deficit_rediscovery', 'domain_backoff',
]);
