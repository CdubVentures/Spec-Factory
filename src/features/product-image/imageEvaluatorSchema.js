import { z } from 'zod';

/**
 * Zod schemas for the Carousel Builder (Vision Evaluator) LLM responses.
 *
 * viewEvalResponseSchema: validates per-view ranking output (best candidate selection).
 * heroEvalResponseSchema: validates hero selection output (cross-view picks).
 */

const evalFlagEnum = z.enum(['watermark', 'badge', 'cropped', 'wrong_product', 'other']);
const actualViewEnum = z.enum(['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle', 'generic']);
const candidateQualityEnum = z.enum(['pass', 'borderline', 'fail']);

const viewCandidateEvalSchema = z.object({
  filename: z.string(),
  actual_view: actualViewEnum,
  matches_requested_view: z.boolean(),
  usable_as_required_view: z.boolean(),
  usable_as_carousel_extra: z.boolean(),
  quality: candidateQualityEnum,
  duplicate: z.boolean(),
  flags: z.array(evalFlagEnum).optional(),
  reasoning: z.string(),
});

export const viewEvalResponseSchema = z.object({
  winner: z.object({
    filename: z.string(),
    reasoning: z.string(),
  }).nullable(),
  candidates: z.array(viewCandidateEvalSchema).optional(),
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
