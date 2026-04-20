/**
 * Shared editorial Zod schemas — the wrappers that GET responses add around
 * raw LLM outputs (publisher_candidates enrichment, rejection metadata,
 * per-source evidence refs).
 *
 * WHY: Future scalar finders (SKU, pricing, MSRP, discontinued, ...) all
 * produce the same shape — one LLM call per variant → candidate with sources
 * → publisher gate → field_candidates enrichment. Centralizing these schemas
 * drives `types.generated.ts` codegen so per-feature type files go away.
 *
 * Imported by:
 *   - releaseDateSchema.js (Phase 3 — RDF getResponse schema)
 *   - future SKU/pricing/... schemas (Phase 4 scalar template)
 */

import { z } from 'zod';

export { evidenceRefSchema, evidenceRefsSchema } from './evidencePromptFragment.js';

/**
 * Publisher candidate reference — the shape merged into GET responses from
 * the `field_candidates` SQL table. One entry per source per variant per field.
 */
export const publisherCandidateRefSchema = z.object({
  candidate_id: z.number(),
  source_id: z.string().default(''),
  source_type: z.string().default(''),
  model: z.string().default(''),
  value: z.string(),
  confidence: z.number(),
  status: z.string(),
  submitted_at: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Rejection metadata for candidates blocked by the publisher gate or
 * validation layer. `reason_code` is an enum at the call site; `detail`
 * is opaque payload the UI may or may not render.
 */
export const rejectionMetadataSchema = z.object({
  reason_code: z.string(),
  detail: z.unknown().optional(),
});
