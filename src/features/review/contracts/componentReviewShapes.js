// WHY: O(1) Feature Scaling — SSOT for component review API response shapes.
// Adding a field = add one { key, coerce } entry here + run codegen.
// Alignment test catches TS drift. Key lists derived for existing consumers.

// WHY: Re-exported from db schema SSOT so feature-internal consumers
// (componentMutationService, test fixtures) keep importing from here.
export { COMPONENT_IDENTITY_PROPERTY_KEYS } from '../../../db/specDbSchema.js';

export const COMPONENT_REVIEW_ITEM_SHAPE = Object.freeze([
  { key: 'component_identity_id', coerce: 'int', nullable: true, optional: true },
  { key: 'name', coerce: 'string' },
  { key: 'maker', coerce: 'string' },
  { key: 'discovered', coerce: 'bool', optional: true },
  { key: 'discovery_source', coerce: 'string', optional: true },
  { key: 'aliases', coerce: 'array', itemType: 'string' },
  { key: 'aliases_overridden', coerce: 'bool' },
  { key: 'links', coerce: 'array', itemType: 'string' },
  { key: 'name_tracked', coerce: 'object' },
  { key: 'maker_tracked', coerce: 'object' },
  { key: 'links_tracked', coerce: 'array', itemType: 'unknown' },
  { key: 'properties', coerce: 'object' },
  { key: 'linked_products', coerce: 'array', itemType: 'unknown', optional: true },
  { key: 'review_status', coerce: 'string', literals: ['pending', 'reviewed', 'approved'] },
  { key: 'metrics', coerce: 'object' },
]);
export const COMPONENT_REVIEW_ITEM_KEYS = Object.freeze(COMPONENT_REVIEW_ITEM_SHAPE.map(d => d.key));

export const COMPONENT_REVIEW_PAYLOAD_SHAPE = Object.freeze([
  { key: 'category', coerce: 'string' },
  { key: 'componentType', coerce: 'string' },
  { key: 'property_columns', coerce: 'array', itemType: 'string' },
  { key: 'items', coerce: 'array', itemRef: 'ComponentReviewItemGen' },
  { key: 'metrics', coerce: 'object' },
]);
export const COMPONENT_REVIEW_PAYLOAD_KEYS = Object.freeze(COMPONENT_REVIEW_PAYLOAD_SHAPE.map(d => d.key));

export const COMPONENT_REVIEW_LAYOUT_SHAPE = Object.freeze([
  { key: 'category', coerce: 'string' },
  { key: 'types', coerce: 'array', itemType: 'unknown' },
]);
export const COMPONENT_REVIEW_LAYOUT_KEYS = Object.freeze(COMPONENT_REVIEW_LAYOUT_SHAPE.map(d => d.key));

export const ENUM_VALUE_REVIEW_ITEM_SHAPE = Object.freeze([
  { key: 'list_value_id', coerce: 'int', nullable: true, optional: true },
  { key: 'enum_list_id', coerce: 'int', nullable: true, optional: true },
  { key: 'value', coerce: 'string' },
  { key: 'source', coerce: 'string', literals: ['reference', 'pipeline', 'manual'] },
  { key: 'source_timestamp', coerce: 'string', nullable: true, optional: true },
  { key: 'confidence', coerce: 'float' },
  { key: 'color', coerce: 'string', literals: ['green', 'yellow', 'red', 'gray', 'purple'] },
  { key: 'needs_review', coerce: 'bool' },
  { key: 'overridden', coerce: 'bool', optional: true },
  { key: 'candidates', coerce: 'array', itemRef: 'ReviewCandidateGen' },
  { key: 'linked_products', coerce: 'array', itemType: 'unknown', optional: true },
  { key: 'normalized_value', coerce: 'string', nullable: true, optional: true },
  { key: 'enum_policy', coerce: 'string', nullable: true, optional: true },
  { key: 'accepted_candidate_id', coerce: 'string', nullable: true, optional: true },
]);
export const ENUM_VALUE_REVIEW_ITEM_KEYS = Object.freeze(ENUM_VALUE_REVIEW_ITEM_SHAPE.map(d => d.key));

export const ENUM_FIELD_REVIEW_SHAPE = Object.freeze([
  { key: 'field', coerce: 'string' },
  { key: 'enum_list_id', coerce: 'int', nullable: true, optional: true },
  { key: 'values', coerce: 'array', itemRef: 'EnumValueReviewItemGen' },
  { key: 'metrics', coerce: 'object' },
]);
export const ENUM_FIELD_REVIEW_KEYS = Object.freeze(ENUM_FIELD_REVIEW_SHAPE.map(d => d.key));

export const ENUM_REVIEW_PAYLOAD_SHAPE = Object.freeze([
  { key: 'category', coerce: 'string' },
  { key: 'fields', coerce: 'array', itemRef: 'EnumFieldReviewGen' },
]);
export const ENUM_REVIEW_PAYLOAD_KEYS = Object.freeze(ENUM_REVIEW_PAYLOAD_SHAPE.map(d => d.key));

export const COMPONENT_REVIEW_FLAGGED_ITEM_SHAPE = Object.freeze([
  { key: 'review_id', coerce: 'string' },
  { key: 'component_type', coerce: 'string' },
  { key: 'field_key', coerce: 'string' },
  { key: 'raw_query', coerce: 'string' },
  { key: 'matched_component', coerce: 'string', nullable: true },
  { key: 'match_type', coerce: 'string' },
  { key: 'name_score', coerce: 'float' },
  { key: 'property_score', coerce: 'float' },
  { key: 'combined_score', coerce: 'float' },
  { key: 'alternatives', coerce: 'array', itemType: 'unknown' },
  { key: 'product_id', coerce: 'string', nullable: true },
  { key: 'run_id', coerce: 'string', nullable: true, optional: true },
  { key: 'status', coerce: 'string' },
  { key: 'ai_decision', coerce: 'object', optional: true },
  { key: 'ai_suggested_name', coerce: 'string', optional: true },
  { key: 'ai_suggested_maker', coerce: 'string', optional: true },
  { key: 'ai_reviewed_at', coerce: 'string', optional: true },
  { key: 'created_at', coerce: 'string' },
  { key: 'product_attributes', coerce: 'object', optional: true },
  { key: 'reasoning_note', coerce: 'string', optional: true },
]);
export const COMPONENT_REVIEW_FLAGGED_ITEM_KEYS = Object.freeze(COMPONENT_REVIEW_FLAGGED_ITEM_SHAPE.map(d => d.key));

export const COMPONENT_REVIEW_DOCUMENT_SHAPE = Object.freeze([
  { key: 'version', coerce: 'int' },
  { key: 'category', coerce: 'string' },
  { key: 'items', coerce: 'array', itemRef: 'ComponentReviewFlaggedItemGen' },
  { key: 'updated_at', coerce: 'string' },
]);
export const COMPONENT_REVIEW_DOCUMENT_KEYS = Object.freeze(COMPONENT_REVIEW_DOCUMENT_SHAPE.map(d => d.key));

export const COMPONENT_REVIEW_BATCH_RESULT_SHAPE = Object.freeze([
  { key: 'processed', coerce: 'int' },
  { key: 'accepted_alias', coerce: 'int' },
  { key: 'pending_human', coerce: 'int' },
  { key: 'rejected', coerce: 'int' },
]);
export const COMPONENT_REVIEW_BATCH_RESULT_KEYS = Object.freeze(COMPONENT_REVIEW_BATCH_RESULT_SHAPE.map(d => d.key));
