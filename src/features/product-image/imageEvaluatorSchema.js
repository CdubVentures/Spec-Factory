import { z } from 'zod';

/**
 * Zod schemas for the Carousel Builder (Vision Evaluator) LLM responses.
 *
 * viewEvalResponseSchema: validates per-view ranking output (best candidate selection).
 * heroEvalResponseSchema: validates hero selection output (cross-view picks).
 */

const evalFlagEnum = z.enum(['watermark', 'badge', 'cropped', 'wrong_product']);

export const viewEvalResponseSchema = z.object({
  rankings: z.array(z.object({
    filename: z.string(),
    rank: z.number().int(),
    best: z.boolean(),
    flags: z.array(evalFlagEnum),
    reasoning: z.string(),
  })),
});

export const heroEvalResponseSchema = z.object({
  heroes: z.array(z.object({
    filename: z.string(),
    hero_rank: z.number().int(),
    reasoning: z.string(),
  })),
});
