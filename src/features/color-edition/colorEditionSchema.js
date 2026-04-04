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
  editions: z.record(z.string(), z.object({
    colors: z.array(z.string()),
  })).default({}),
  default_color: z.string().default(''),
});
