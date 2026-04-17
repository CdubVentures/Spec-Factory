import { z } from 'zod';

/**
 * Zod schema for the Release Date Finder LLM response.
 *
 * One LLM call per variant → one date candidate + evidence refs + discovery log.
 * The orchestrator validates, then routes to submitCandidate() for publisher-gated
 * publication (min_evidence_refs + tier_preference checked in the candidate gate).
 *
 * Accepted date formats (aligned with release_date EG preset):
 *   YYYY-MM-DD | YYYY-MM | YYYY | MMM YYYY | Month YYYY | unk
 */
export const releaseDateFinderResponseSchema = z.object({
  release_date: z.string(),
  confidence: z.number().int().min(0).max(100).default(0),
  unknown_reason: z.string().default(''),
  evidence: z.array(z.object({
    source_url: z.string().default(''),
    source_page: z.string().default(''),
    source_type: z.enum(['manufacturer', 'retailer', 'review', 'press', 'other']).default('other'),
    tier: z.enum(['tier1', 'tier2', 'tier3', 'unknown']).default('unknown'),
    excerpt: z.string().default(''),
  })).default([]),
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
