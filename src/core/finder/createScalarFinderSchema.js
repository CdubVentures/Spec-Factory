/**
 * createScalarFinderSchema — factory for scalar field finder LLM response schemas.
 *
 * Declarative: every scalar field finder (release_date, sku, msrp, discontinued,
 * upc, ...) shares the same response envelope — one scalar value + confidence +
 * evidence refs + discovery log. Only the value key and its primitive type
 * differ. This factory builds the Zod schema from those three pieces.
 *
 * Returned schema shape (identical across all scalar finders):
 *   {
 *     [valueKey]: <value schema>,
 *     confidence: 0-100 int (default 0),
 *     unknown_reason: string (default ''),
 *     evidence_refs: array of { url, tier, confidence } (default []),
 *     discovery_log: { urls_checked, queries_run, notes } (default {})
 *   }
 *
 * @see src/features/release-date/releaseDateSchema.js for the canonical consumer.
 */

import { z } from 'zod';
import { evidenceRefsSchema, evidenceRefsExtendedSchema } from './evidencePromptFragment.js';
import { valueConfidenceSchema } from './valueConfidencePromptFragment.js';

const VALUE_TYPE_SCHEMAS = {
  // WHY: Date strings are validated by the prompt's precision ladder (YYYY-MM-DD /
  // YYYY-MM / YYYY / "unk"). Runtime is a plain string — the LLM sends 'unk' as
  // a string literal. Down-stream publisher gate does further format checks.
  date: () => z.string(),
  string: () => z.string(),
  // WHY: int accepts number OR string to allow 'unk' literal alongside real ints.
  int: () => z.number().int().nonnegative().or(z.string()),
};

export function createScalarFinderSchema({
  valueKey,
  valueType = 'string',
  valueRegex,
  includeEvidenceKind = false,
} = {}) {
  if (!valueKey) throw new Error('createScalarFinderSchema: valueKey required');
  const builder = VALUE_TYPE_SCHEMAS[valueType];
  if (!builder) {
    throw new Error(`createScalarFinderSchema: unknown valueType '${valueType}' (allowed: date, string, int)`);
  }

  let valueSchema = builder();
  if (valueRegex) {
    const re = new RegExp(valueRegex);
    valueSchema = valueSchema.refine(
      (v) => v === 'unk' || (typeof v === 'string' && re.test(v)),
      { message: `value must match ${valueRegex} or be 'unk'` },
    );
  }

  const evidenceRefsShape = includeEvidenceKind
    ? evidenceRefsExtendedSchema
    : evidenceRefsSchema;

  return z.object({
    [valueKey]: valueSchema,
    confidence: valueConfidenceSchema.default(0),
    unknown_reason: z.string().default(''),
    evidence_refs: evidenceRefsShape,
    discovery_log: z.object({
      urls_checked: z.array(z.string()).default([]),
      queries_run: z.array(z.string()).default([]),
      notes: z.array(z.string()).default([]),
    }).default({ urls_checked: [], queries_run: [], notes: [] }),
  });
}
