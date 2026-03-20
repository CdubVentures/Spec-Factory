// WHY: O(1) Feature Scaling — single source of truth for review payload shapes.
// All field state keys, candidate keys, and key-review keys are defined here.
// Backend builders and frontend types derive from these constants.

// WHY: Canonical keys returned by buildFieldState() in reviewGridData.js.
// Adding a new field state property = add it here + in the builder. The frontend
// type auto-derives from this list.
export const FIELD_STATE_KEYS = Object.freeze([
  'selected',
  'needs_review',
  'reason_codes',
  'candidate_count',
  'candidates',
  'accepted_candidate_id',
  'selected_candidate_id',
  'source',
  'method',
  'tier',
  'evidence_url',
  'evidence_quote',
]);

// WHY: Optional keys that may be added by route handlers after buildFieldState.
export const FIELD_STATE_OPTIONAL_KEYS = Object.freeze([
  'slot_id',
  'overridden',
  'source_timestamp',
  'keyReview',
]);

export const FIELD_STATE_SELECTED_KEYS = Object.freeze([
  'value', 'confidence', 'status', 'color',
]);

export const FIELD_STATE_STATUS_VALUES = Object.freeze(['ok', 'needs_review']);

export const CONFIDENCE_COLOR_VALUES = Object.freeze(['green', 'yellow', 'red', 'gray']);

// WHY: Canonical keys for candidate objects.
export const REVIEW_CANDIDATE_KEYS = Object.freeze([
  'candidate_id',
  'value',
  'score',
  'source_id',
  'source',
  'tier',
  'method',
  'evidence',
  'is_synthetic_selected',
  'llm_extract_model',
  'llm_extract_provider',
  'llm_validate_model',
  'llm_validate_provider',
  'primary_review_status',
  'shared_review_status',
  'human_accepted',
]);

export const CANDIDATE_EVIDENCE_KEYS = Object.freeze([
  'url', 'retrieved_at', 'snippet_id', 'snippet_hash',
  'quote', 'quote_span', 'snippet_text', 'source_id',
]);

// WHY: Canonical keys for keyReview lane state (added by fieldReviewHandlers).
export const KEY_REVIEW_LANE_KEYS = Object.freeze([
  'id',
  'selectedCandidateId',
  'primaryStatus',
  'primaryConfidence',
  'sharedStatus',
  'sharedConfidence',
  'userAcceptPrimary',
  'userAcceptShared',
  'overridePrimary',
  'overrideShared',
]);

export const REVIEW_STATUS_VALUES = Object.freeze([
  'pending', 'confirmed', 'rejected', 'not_run',
]);

// WHY: Product review payload top-level structure.
export const PRODUCT_REVIEW_PAYLOAD_KEYS = Object.freeze([
  'product_id', 'category', 'identity', 'fields', 'metrics', 'hasRun',
]);

export const PRODUCT_IDENTITY_KEYS = Object.freeze([
  'id', 'identifier', 'brand', 'model', 'variant',
]);

export const PRODUCT_METRICS_KEYS = Object.freeze([
  'confidence', 'coverage', 'flags', 'missing', 'has_run', 'updated_at',
]);
