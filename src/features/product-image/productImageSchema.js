import { z } from 'zod';

/**
 * Zod schema for the Product Image Finder LLM response.
 *
 * The LLM returns direct-download URLs for each requested view.
 * The orchestrator downloads + validates before persisting.
 */
export const productImageFinderResponseSchema = z.object({
  images: z.array(z.object({
    view: z.string(),
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
});
