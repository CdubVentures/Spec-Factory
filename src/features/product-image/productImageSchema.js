import { z } from 'zod';

/**
 * Zod schema for the Product Image Finder LLM response.
 *
 * View names are constrained to the 8 canonical product-photography
 * angles aligned with the Photoshop cut-out pipeline.
 *
 * WHY: PIF is the evidence-refs exception across the finders — the image
 * URL IS the evidence, and images are not wired through the publisher's
 * candidate gate. No evidence_refs / tier captured here.
 *
 * The orchestrator downloads + validates before persisting.
 */
export const productImageFinderResponseSchema = z.object({
  images: z.array(z.object({
    view: z.enum(['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle', 'hero']),
    url: z.string(),
    source_page: z.string().default(''),
    alt_text: z.string().default(''),
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
  // WHY: partitions previous-discovery history by run type so cross-pool URLs/queries
  // don't mis-signal "exhausted" to the LLM. Optional + free-form so older runs without
  // it remain valid and matchers naturally skip them.
  run_scope_key: z.string().optional(),
});
