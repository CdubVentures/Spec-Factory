/**
 * createScalarFinderEditorialSchemas — factory for scalar finder editorial Zod.
 *
 * Given an LLM response schema (from createScalarFinderSchema), produces the
 * three editorial Zod shapes every scalar finder needs for its GET response:
 *
 *   - candidateSchema   : per-variant editorial candidate (variant identity +
 *                         value + sources + publisher enrichment + rejection
 *                         metadata)
 *   - runSchema         : per-run audit entry (model/timing + selected snapshot +
 *                         prompt + variant-scoped LLM response)
 *   - getResponseSchema : full GET payload (summary + candidates + runs)
 *
 * Drives types.generated.ts codegen (via getResponseSchemaExport in the registry).
 *
 * @see src/features/release-date/releaseDateSchema.js — canonical consumer
 */

import { z } from 'zod';
import { evidenceRefSchema } from './evidencePromptFragment.js';
import { publisherCandidateRefSchema, rejectionMetadataSchema } from './editorialSchemas.js';

export function createScalarFinderEditorialSchemas({ llmResponseSchema } = {}) {
  if (!llmResponseSchema) {
    throw new Error('createScalarFinderEditorialSchemas: llmResponseSchema required');
  }

  const candidateSchema = z.object({
    variant_id: z.string().nullable(),
    variant_key: z.string(),
    variant_label: z.string(),
    variant_type: z.string(),
    value: z.string(),
    confidence: z.number(),
    unknown_reason: z.string().default(''),
    sources: z.array(evidenceRefSchema).default([]),
    ran_at: z.string(),
    rejected_by_gate: z.boolean().optional(),
    rejection_reasons: z.array(rejectionMetadataSchema).optional(),
    publisher_error: z.string().optional(),
    publisher_candidates: z.array(publisherCandidateRefSchema).optional(),
  });

  const runSchema = z.object({
    run_number: z.number(),
    ran_at: z.string(),
    model: z.string(),
    fallback_used: z.boolean(),
    effort_level: z.string().optional(),
    access_mode: z.string().optional(),
    thinking: z.boolean().optional(),
    web_search: z.boolean().optional(),
    started_at: z.string().nullable().optional(),
    duration_ms: z.number().nullable().optional(),
    selected: z.object({ candidates: z.array(candidateSchema) }),
    prompt: z.object({ system: z.string(), user: z.string() }),
    response: llmResponseSchema.extend({
      started_at: z.string().optional(),
      duration_ms: z.number().optional(),
      variant_id: z.string().nullable(),
      variant_key: z.string(),
      variant_label: z.string(),
      loop_id: z.string().optional(),
    }),
  });

  const getResponseSchema = z.object({
    product_id: z.string(),
    category: z.string(),
    run_count: z.number(),
    last_ran_at: z.string(),
    candidates: z.array(candidateSchema),
    candidate_count: z.number(),
    published_value: z.string(),
    published_confidence: z.number().nullable(),
    selected: z.object({ candidates: z.array(candidateSchema) }),
    runs: z.array(runSchema),
  });

  return { candidateSchema, runSchema, getResponseSchema };
}
