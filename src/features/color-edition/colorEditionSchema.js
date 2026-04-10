import { z } from 'zod';

/**
 * Zod schema for the Color & Edition Finder LLM response.
 *
 * - colors: flat array of ALL product colors (colors[0] = default)
 * - editions: keyed by slug, each with its own colors subset
 * - default_color: must equal colors[0]
 */
export const colorEditionFinderResponseSchema = z.object({
  colors: z.array(z.string()),
  color_names: z.record(z.string(), z.string()).default({}),
  editions: z.record(z.string(), z.object({
    display_name: z.string().default(''),
    colors: z.array(z.string()),
  })).default({}),
  default_color: z.string().default(''),
  siblings_excluded: z.array(z.string()).default([]),
  discovery_log: z.object({
    confirmed_from_known: z.array(z.string()).default([]),
    added_new: z.array(z.string()).default([]),
    rejected_from_known: z.array(z.string()).default([]),
    urls_checked: z.array(z.string()).default([]),
    queries_run: z.array(z.string()).default([]),
  }).default({
    confirmed_from_known: [],
    added_new: [],
    rejected_from_known: [],
    urls_checked: [],
    queries_run: [],
  }),
});
