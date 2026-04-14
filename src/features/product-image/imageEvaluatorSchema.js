import { z } from 'zod';

/**
 * Zod schemas for the Carousel Builder (Vision Evaluator) LLM responses.
 *
 * viewEvalResponseSchema: validates per-view ranking output (best candidate selection).
 * heroEvalResponseSchema: validates hero selection output (cross-view picks).
 */

const evalFlagEnum = z.enum(['watermark', 'badge', 'cropped', 'wrong_product', 'other']);

export const viewEvalResponseSchema = z.object({
  winner: z.object({
    filename: z.string(),
    reasoning: z.string(),
  }).nullable(),
  rejected: z.array(z.object({
    filename: z.string(),
    flags: z.array(evalFlagEnum).optional(),
    reasoning: z.string().optional(),
  })).optional(),
});

export const heroEvalResponseSchema = z.object({
  heroes: z.array(z.object({
    filename: z.string(),
    hero_rank: z.number().int(),
    reasoning: z.string(),
  })),
  rejected: z.array(z.object({
    filename: z.string(),
    flags: z.array(evalFlagEnum).optional(),
    reasoning: z.string(),
  })).optional(),
});
