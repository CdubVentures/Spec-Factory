// WHY: O(1) Feature Scaling — SSOT for component review API response shapes.
// Adding a field = add one entry here. Alignment test catches TS drift.

export const COMPONENT_REVIEW_ITEM_KEYS = Object.freeze([
  'component_identity_id', 'name', 'maker', 'discovered', 'discovery_source',
  'aliases', 'aliases_overridden', 'links',
  'name_tracked', 'maker_tracked', 'links_tracked',
  'properties', 'linked_products', 'review_status', 'metrics',
]);

export const COMPONENT_REVIEW_PAYLOAD_KEYS = Object.freeze([
  'category', 'componentType', 'property_columns', 'items', 'metrics',
]);

export const COMPONENT_REVIEW_LAYOUT_KEYS = Object.freeze([
  'category', 'types',
]);

export const ENUM_VALUE_REVIEW_ITEM_KEYS = Object.freeze([
  'list_value_id', 'enum_list_id', 'value', 'source', 'source_timestamp',
  'confidence', 'color', 'needs_review', 'overridden', 'candidates',
  'linked_products', 'normalized_value', 'enum_policy', 'accepted_candidate_id',
]);

export const ENUM_FIELD_REVIEW_KEYS = Object.freeze([
  'field', 'enum_list_id', 'values', 'metrics',
]);

export const ENUM_REVIEW_PAYLOAD_KEYS = Object.freeze([
  'category', 'fields',
]);

export const COMPONENT_REVIEW_FLAGGED_ITEM_KEYS = Object.freeze([
  'review_id', 'component_type', 'field_key', 'raw_query',
  'matched_component', 'match_type', 'name_score', 'property_score', 'combined_score',
  'alternatives', 'product_id', 'run_id', 'status',
  'ai_decision', 'ai_suggested_name', 'ai_suggested_maker', 'ai_reviewed_at',
  'created_at', 'product_attributes', 'reasoning_note',
]);

export const COMPONENT_REVIEW_DOCUMENT_KEYS = Object.freeze([
  'version', 'category', 'items', 'updated_at',
]);

export const COMPONENT_REVIEW_BATCH_RESULT_KEYS = Object.freeze([
  'processed', 'accepted_alias', 'pending_human', 'rejected',
]);
