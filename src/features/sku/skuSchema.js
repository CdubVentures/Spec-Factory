/**
 * SKU Finder — Zod schemas (factory-driven).
 *
 * Mirrors RDF's scalar-finder shape. `includeEvidenceKind: true` opts SKF into
 * the extended evidence schema (supporting_evidence ≤280 chars + evidence_kind
 * 10-value enum) — matches RDF post-upgrade.
 *
 * Accepted value formats: any non-empty string (MPN formats vary per
 * manufacturer; no runtime regex validation) or `"unk"`.
 */

import { createScalarFinderSchema } from '../../core/finder/createScalarFinderSchema.js';
import { createScalarFinderEditorialSchemas } from '../../core/finder/createScalarFinderEditorialSchemas.js';

export const skuFinderResponseSchema = createScalarFinderSchema({
  valueKey: 'sku',
  valueType: 'string',
  includeEvidenceKind: true,
});

const editorial = createScalarFinderEditorialSchemas({
  llmResponseSchema: skuFinderResponseSchema,
  includeEvidenceKind: true,
});

export const skuFinderCandidateSchema = editorial.candidateSchema;
export const skuFinderRunSchema = editorial.runSchema;
export const skuFinderGetResponseSchema = editorial.getResponseSchema;
