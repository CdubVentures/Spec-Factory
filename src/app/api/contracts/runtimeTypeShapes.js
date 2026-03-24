// WHY: O(1) Feature Scaling — SSOT for runtime trace/frontier type shapes.
// Skip RuntimeOverrides (has index signature, intentionally open-ended).

export const TRACE_ENTRY_KEYS = Object.freeze([
  'file', 'section', 'ts', 'data',
]);

export const FRONTIER_ENTRY_KEYS = Object.freeze([
  'url', 'rootDomain', 'priority', 'attempts', 'lastAttempt', 'status',
]);

export const LLM_TRACE_ENTRY_KEYS = Object.freeze([
  'ts', 'model', 'purpose', 'inputTokens', 'outputTokens',
  'costUsd', 'durationMs', 'field',
]);
