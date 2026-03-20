// WHY: O(1) Feature Scaling — single source of truth for source strategy shapes.
// All field keys, defaults, enum values, and mutable-key sets are derived from
// the canonical Zod schema in sourceRegistry.js. Adding a new source field =
// add one field to sourceEntrySchema. Zero changes anywhere else.

import {
  sourceEntrySchema,
  TIER_ENUM,
} from '../sourceRegistry.js';

// WHY: Zod v4 exposes shape as a property on the schema object.
// Extract field keys from the Zod schema shape.
const schemaShape = sourceEntrySchema.shape;

export const SOURCE_ENTRY_FIELD_KEYS = Object.freeze(Object.keys(schemaShape));

export const TIER_VALUES = Object.freeze([...TIER_ENUM]);

export const AUTHORITY_VALUES = Object.freeze([
  'authoritative', 'instrumented', 'aggregator', 'community', 'unknown',
]);

export const DISCOVERY_METHOD_VALUES = Object.freeze([
  'manual', 'search_first',
]);

export const FIELD_COVERAGE_KEYS = Object.freeze(['high', 'medium', 'low']);

export const PACING_FIELD_KEYS = Object.freeze([
  'rate_limit_ms', 'timeout_ms', 'max_concurrent',
]);

// WHY: Defaults extracted from the Zod schema by parsing an empty-ish object.
// This guarantees defaults match the schema exactly.
const _parsed = sourceEntrySchema.parse({
  host: '', tier: 'tier2_lab',
});
const { host: _host, tier: _tier, ...defaultsWithoutRequired } = _parsed;
export const SOURCE_ENTRY_DEFAULTS = Object.freeze(defaultsWithoutRequired);

export const DISCOVERY_DEFAULTS = Object.freeze({
  method: 'manual',
  source_type: '',
  search_pattern: '',
  priority: 50,
  enabled: true,
  notes: '',
});

export const DISCOVERY_FIELD_KEYS = Object.freeze(Object.keys(DISCOVERY_DEFAULTS));

// WHY: Mutable keys derived from schema shape minus computed/identity fields.
// Replaces the hand-maintained SOURCE_ENTRY_MUTABLE_KEYS in sourceFileService.js.
const NON_MUTABLE_KEYS = new Set(['host', 'health', 'synthetic']);

export function sourceEntryMutableKeys() {
  const keys = new Set();
  for (const key of SOURCE_ENTRY_FIELD_KEYS) {
    if (NON_MUTABLE_KEYS.has(key)) continue;
    keys.add(key);
  }
  // WHY: discovery, crawl_config, enabled, notes, label, url, approved,
  // source_type are legacy mutation keys not in the Zod schema but accepted
  // by the PATCH endpoint for backward compatibility.
  for (const legacy of ['discovery', 'crawl_config', 'enabled', 'notes', 'label', 'url', 'approved', 'source_type']) {
    keys.add(legacy);
  }
  return keys;
}
