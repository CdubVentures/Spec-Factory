/**
 * Release Date Finder — Zod schemas (factory-driven).
 *
 * Every shape here is derived from the shared scalar-finder factories in
 * `src/core/finder/`. The hand-written schemas this file used to carry have
 * been replaced by declarative factory calls; behavior is byte-identical.
 *
 * Exports (names preserved — do NOT rename; external consumers depend on them):
 *   - releaseDateFinderResponseSchema    — LLM response shape (per-variant)
 *   - releaseDateFinderCandidateSchema   — editorial per-variant candidate
 *   - releaseDateFinderRunSchema         — per-run audit entry
 *   - releaseDateFinderGetResponseSchema — full GET payload (drives types.generated.ts)
 *
 * Accepted date formats (aligned with release_date EG preset):
 *   YYYY-MM-DD | YYYY-MM | YYYY | MMM YYYY | Month YYYY | unk
 */

import { createScalarFinderSchema } from '../../core/finder/createScalarFinderSchema.js';
import { createScalarFinderEditorialSchemas } from '../../core/finder/createScalarFinderEditorialSchemas.js';

export const releaseDateFinderResponseSchema = createScalarFinderSchema({
  valueKey: 'release_date',
  valueType: 'date',
});

const editorial = createScalarFinderEditorialSchemas({
  llmResponseSchema: releaseDateFinderResponseSchema,
});

export const releaseDateFinderCandidateSchema = editorial.candidateSchema;
export const releaseDateFinderRunSchema = editorial.runSchema;
export const releaseDateFinderGetResponseSchema = editorial.getResponseSchema;
