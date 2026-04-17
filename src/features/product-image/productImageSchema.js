import { z } from 'zod';

// WHY: Shared evidence-ref shape — {url, tier} per source. Attached per-image
// so the LLM cites the page(s) where it found each image being used for this
// product variant.
const evidenceRefSchema = z.object({
  url: z.string(),
  tier: z.string(),
});

/**
 * Zod schema for the Product Image Finder LLM response.
 *
 * View names are constrained to the 8 canonical product-photography
 * angles aligned with the Photoshop cut-out pipeline.
 *
 * The orchestrator downloads + validates before persisting.
 */
export const productImageFinderResponseSchema = z.object({
  images: z.array(z.object({
    view: z.enum(['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle', 'hero']),
    url: z.string(),
    source_page: z.string().default(''),
    alt_text: z.string().default(''),
    evidence_refs: z.array(evidenceRefSchema).default([]),
  })),
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
