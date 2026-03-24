// WHY: O(1) Feature Scaling — SSOT for studio API response shapes.
// Covers only typed response envelopes. Open-ended config types (FieldRule,
// StudioConfig, etc. with [k: string]: unknown) are intentionally excluded.

export const STUDIO_PAYLOAD_KEYS = Object.freeze([
  'category', 'fieldRules', 'fieldOrder', 'uiFieldCatalog',
  'guardrails', 'compiledAt', 'mapSavedAt', 'compileStale',
]);

export const FIELD_STUDIO_MAP_RESPONSE_KEYS = Object.freeze([
  'file_path', 'map', 'error',
]);

export const TOOLTIP_BANK_RESPONSE_KEYS = Object.freeze([
  'entries', 'files', 'configuredPath',
]);

export const ARTIFACT_ENTRY_KEYS = Object.freeze([
  'name', 'size', 'updated',
]);

export const KNOWN_VALUES_RESPONSE_KEYS = Object.freeze([
  'category', 'source', 'fields', 'enum_lists',
]);

export const COMPONENT_DB_ITEM_KEYS = Object.freeze([
  'name', 'maker', 'aliases',
]);
