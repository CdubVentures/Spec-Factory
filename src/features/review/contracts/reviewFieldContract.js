// WHY: O(1) Feature Scaling — single source of truth for review payload shapes.
// All field state keys, candidate keys, and key-review keys are defined here.
// Backend builders and frontend codegen derive from these shape descriptors.
// Adding a new field = add one { key, coerce } entry here + run codegen.

// ── Field State ─────────────────────────────────────────────────────

// WHY: Canonical keys returned by buildFieldState() in reviewGridData.js.
export const FIELD_STATE_SELECTED_SHAPE = Object.freeze([
  { key: 'value', coerce: 'unknown' },
  { key: 'unit', coerce: 'string', nullable: true, optional: true },
  { key: 'confidence', coerce: 'float' },
  { key: 'status', coerce: 'string' },
  { key: 'color', coerce: 'string', literals: ['green', 'yellow', 'red', 'gray'] },
]);
export const FIELD_STATE_SELECTED_KEYS = Object.freeze(FIELD_STATE_SELECTED_SHAPE.map(d => d.key));

export const FIELD_STATE_SHAPE = Object.freeze([
  { key: 'selected', coerce: 'object' },
  { key: 'needs_review', coerce: 'bool' },
  { key: 'reason_codes', coerce: 'array', itemType: 'string' },
  { key: 'candidate_count', coerce: 'int' },
  { key: 'candidates', coerce: 'array', itemRef: 'ReviewCandidateGen' },
  { key: 'accepted_candidate_id', coerce: 'string', nullable: true },
  { key: 'selected_candidate_id', coerce: 'string', nullable: true },
  { key: 'source', coerce: 'string', optional: true },
  { key: 'method', coerce: 'string', optional: true },
  { key: 'tier', coerce: 'int', nullable: true, optional: true },
  { key: 'evidence_url', coerce: 'string', optional: true },
  { key: 'evidence_quote', coerce: 'string', optional: true },
  { key: 'overridden', coerce: 'bool', optional: true },
  { key: 'source_timestamp', coerce: 'string', nullable: true, optional: true },
]);
export const FIELD_STATE_KEYS = Object.freeze(
  FIELD_STATE_SHAPE.filter(d => !d.optional).map(d => d.key),
);
export const FIELD_STATE_OPTIONAL_KEYS = Object.freeze(
  FIELD_STATE_SHAPE.filter(d => d.optional).map(d => d.key),
);

export const FIELD_STATE_STATUS_VALUES = Object.freeze(['ok', 'needs_review']);
export const CONFIDENCE_COLOR_VALUES = Object.freeze(['green', 'yellow', 'red', 'gray']);

// ── Candidate ───────────────────────────────────────────────────────

export const CANDIDATE_EVIDENCE_SHAPE = Object.freeze([
  { key: 'url', coerce: 'string' },
  { key: 'retrieved_at', coerce: 'string' },
  { key: 'snippet_id', coerce: 'string' },
  { key: 'snippet_hash', coerce: 'string' },
  { key: 'quote', coerce: 'string' },
  { key: 'quote_span', coerce: 'array', itemType: 'number', nullable: true },
  { key: 'snippet_text', coerce: 'string' },
  { key: 'source_id', coerce: 'string' },
]);
export const CANDIDATE_EVIDENCE_KEYS = Object.freeze(CANDIDATE_EVIDENCE_SHAPE.map(d => d.key));

export const REVIEW_CANDIDATE_SHAPE = Object.freeze([
  { key: 'candidate_id', coerce: 'string' },
  { key: 'value', coerce: 'unknown' },
  { key: 'unit', coerce: 'string', nullable: true, optional: true },
  { key: 'score', coerce: 'float' },
  { key: 'source_id', coerce: 'string' },
  { key: 'source', coerce: 'string' },
  { key: 'tier', coerce: 'int', nullable: true },
  { key: 'method', coerce: 'string', nullable: true },
  { key: 'evidence', coerce: 'object' },
  { key: 'is_synthetic_selected', coerce: 'bool', optional: true },
  { key: 'llm_extract_model', coerce: 'string', nullable: true, optional: true },
  { key: 'llm_extract_provider', coerce: 'string', nullable: true, optional: true },
  { key: 'llm_validate_model', coerce: 'string', nullable: true, optional: true },
  { key: 'llm_validate_provider', coerce: 'string', nullable: true, optional: true },
  { key: 'primary_review_status', coerce: 'string', literals: ['pending', 'accepted', 'rejected'], optional: true },
  { key: 'shared_review_status', coerce: 'string', literals: ['pending', 'accepted', 'rejected'], optional: true },
  { key: 'human_accepted', coerce: 'bool', optional: true },
]);
export const REVIEW_CANDIDATE_KEYS = Object.freeze(REVIEW_CANDIDATE_SHAPE.map(d => d.key));

// ── Product Review Payload ──────────────────────────────────────────

export const PRODUCT_IDENTITY_SHAPE = Object.freeze([
  { key: 'id', coerce: 'int' },
  { key: 'identifier', coerce: 'string' },
  { key: 'brand', coerce: 'string' },
  { key: 'model', coerce: 'string' },
  { key: 'variant', coerce: 'string' },
]);
export const PRODUCT_IDENTITY_KEYS = Object.freeze(PRODUCT_IDENTITY_SHAPE.map(d => d.key));

export const PRODUCT_METRICS_SHAPE = Object.freeze([
  { key: 'confidence', coerce: 'float' },
  { key: 'coverage', coerce: 'float' },
  { key: 'flags', coerce: 'int' },
  { key: 'missing', coerce: 'int' },
  { key: 'has_run', coerce: 'bool' },
  { key: 'updated_at', coerce: 'string' },
]);
export const PRODUCT_METRICS_KEYS = Object.freeze(PRODUCT_METRICS_SHAPE.map(d => d.key));

export const PRODUCT_REVIEW_PAYLOAD_SHAPE = Object.freeze([
  { key: 'product_id', coerce: 'string' },
  { key: 'category', coerce: 'string' },
  { key: 'identity', coerce: 'object' },
  { key: 'fields', coerce: 'object' },
  { key: 'metrics', coerce: 'object' },
  { key: 'hasRun', coerce: 'bool', optional: true },
]);
export const PRODUCT_REVIEW_PAYLOAD_KEYS = Object.freeze(PRODUCT_REVIEW_PAYLOAD_SHAPE.map(d => d.key));

// ── Envelope Types ──────────────────────────────────────────────────

export const REVIEW_LAYOUT_ROW_SHAPE = Object.freeze([
  { key: 'group', coerce: 'string' },
  { key: 'key', coerce: 'string' },
  { key: 'label', coerce: 'string' },
  { key: 'field_rule', coerce: 'object' },
]);
export const REVIEW_LAYOUT_ROW_KEYS = Object.freeze(REVIEW_LAYOUT_ROW_SHAPE.map(d => d.key));

export const REVIEW_LAYOUT_SHAPE = Object.freeze([
  { key: 'category', coerce: 'string' },
  { key: 'rows', coerce: 'array', itemRef: 'ReviewLayoutRowGen' },
]);
export const REVIEW_LAYOUT_KEYS = Object.freeze(REVIEW_LAYOUT_SHAPE.map(d => d.key));

export const RUN_METRICS_SHAPE = Object.freeze([
  { key: 'confidence', coerce: 'float' },
  { key: 'coverage', coerce: 'float' },
  { key: 'flags', coerce: 'int' },
  { key: 'missing', coerce: 'int' },
  { key: 'count', coerce: 'int' },
]);
export const RUN_METRICS_KEYS = Object.freeze(RUN_METRICS_SHAPE.map(d => d.key));

export const PRODUCTS_INDEX_RESPONSE_SHAPE = Object.freeze([
  { key: 'products', coerce: 'array', itemRef: 'ProductReviewPayloadGen' },
  { key: 'brands', coerce: 'array', itemType: 'string' },
  { key: 'total', coerce: 'int' },
  { key: 'metrics_run', coerce: 'bool' },
]);
export const PRODUCTS_INDEX_RESPONSE_KEYS = Object.freeze(PRODUCTS_INDEX_RESPONSE_SHAPE.map(d => d.key));

export const CANDIDATE_RESPONSE_SHAPE = Object.freeze([
  { key: 'product_id', coerce: 'string' },
  { key: 'field', coerce: 'string' },
  { key: 'candidates', coerce: 'array', itemRef: 'ReviewCandidateGen' },
  { key: 'candidate_count', coerce: 'int' },
]);
export const CANDIDATE_RESPONSE_KEYS = Object.freeze(CANDIDATE_RESPONSE_SHAPE.map(d => d.key));
