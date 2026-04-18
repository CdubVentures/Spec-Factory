import { z } from 'zod';
import { evidenceRefsSchema } from '../../core/finder/evidencePromptFragment.js';

/**
 * Zod schema for the Release Date Finder LLM response.
 *
 * One LLM call per variant → one date candidate + evidence refs + discovery log.
 * The orchestrator routes to submitCandidate() for publisher-gated publication
 * (min_evidence_refs checked in the candidate gate).
 *
 * Accepted date formats (aligned with release_date EG preset):
 *   YYYY-MM-DD | YYYY-MM | YYYY | MMM YYYY | Month YYYY | unk
 *
 * WHY: `evidence_refs` shape is the universal {url, tier, confidence} imported
 * from the shared evidence module — no local definition. `confidence` on the
 * response root is the overall candidate confidence (distinct from the
 * per-source confidence inside each evidence_refs entry).
 */
export const releaseDateFinderResponseSchema = z.object({
  release_date: z.string(),
  confidence: z.number().int().min(0).max(100).default(0),
  unknown_reason: z.string().default(''),
  evidence_refs: evidenceRefsSchema,
  discovery_log: z.object({
    urls_checked: z.array(z.string()).default([]),
    queries_run: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
  }).default({
    urls_checked: [],
    queries_run: [],
    notes: [],
  }),
});
