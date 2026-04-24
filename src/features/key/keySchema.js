/**
 * Key Finder — Zod response schemas.
 *
 * Multi-key envelope: one LLM call may return a primary key plus zero or more
 * passenger keys (bundling). Per-key results share the scalar-finder value /
 * evidence / confidence fields, but discovery_log is envelope-level only:
 * passengers inherit the primary search session and must not own query history.
 *
 * Exports:
 *   - perKeyShape(valueKey)       — factory for a single field's response shape
 *   - keyFinderResponseSchema     — the full LLM response envelope
 */

import { z } from 'zod';
import { createScalarFinderSchema } from '../../core/finder/createScalarFinderSchema.js';

// WHY: value is `z.unknown()` so the LLM can emit the native JSON type declared
// by each field's contract (number for int/number fields, array for list-shape
// fields, string for enum/date, boolean for bool). Downstream parsing coerces
// against fieldRule.contract per key. Sentinel "unk" is a string either way.
export function perKeyShape(valueKey) {
  const base = createScalarFinderSchema({
    valueKey,
    valueType: 'string',
    includeEvidenceKind: true,
  }).omit({ discovery_log: true });
  return base.extend({ [valueKey]: z.unknown() });
}

const PER_KEY_VALUE = perKeyShape('value');

export const keyFinderResponseSchema = z.object({
  primary_field_key: z.string().min(1),
  results: z.record(z.string(), PER_KEY_VALUE),
  discovery_log: z.object({
    urls_checked: z.array(z.string()).default([]),
    queries_run: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
  }).default({ urls_checked: [], queries_run: [], notes: [] }),
}).refine(
  (data) => Object.prototype.hasOwnProperty.call(data.results, data.primary_field_key),
  { message: 'primary_field_key must exist as a key in results' },
);
