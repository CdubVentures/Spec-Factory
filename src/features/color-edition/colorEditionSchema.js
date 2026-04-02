import { z } from 'zod';

/**
 * Zod schema for the Color & Edition Finder LLM response.
 *
 * - colors: EG-format color strings (atoms joined by "+", dominant-first)
 * - editions: kebab-case slugs
 * - new_colors: unknown atoms the LLM discovered, with hex for auto-registration
 */
export const colorEditionFinderResponseSchema = z.object({
  colors: z.array(z.string()),
  editions: z.array(z.string()),
  new_colors: z.array(z.object({
    name: z.string(),
    hex: z.string(),
  })).optional().default([]),
});
