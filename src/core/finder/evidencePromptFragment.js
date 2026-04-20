/**
 * Shared evidence contract for finder LLMs.
 *
 * Base shape (CEF + PIF + carousel builder): { url, tier, confidence }.
 * Extended shape (RDF + variantScalarFieldProducer, opt-in via
 * `includeEvidenceKind: true`): adds `supporting_evidence` (<=280 chars)
 * and `evidence_kind` (10-value enum) so each URL carries the on-page
 * quote or one-line reasoning tying it to the claim.
 *
 * The extended block only applies where value-deduction is the core
 * question ("what IS the release date / dpi / switch_type"); CEF/PIF
 * stay on the base shape because their question is "does this exist".
 */

import { z } from 'zod';
import { resolvePromptTemplate } from '../llm/resolvePromptTemplate.js';
import { resolveGlobalPrompt } from '../llm/prompts/globalPromptRegistry.js';

// ── Base zod schema (universal shape) ───────────────────────────────

export const evidenceRefSchema = z.object({
  url: z.string(),
  tier: z.string(),
  confidence: z.number().int().min(0).max(100).default(0),
});

export const evidenceRefsSchema = z.array(evidenceRefSchema).default([]);

// ── Extended schema (RDF + scalar producer opt-in) ──────────────────

export const EVIDENCE_KIND_VALUES = Object.freeze([
  'direct_quote',
  'structured_metadata',
  'byline_timestamp',
  'artifact_metadata',
  'visual_inspection',
  'lab_measurement',
  'comparative_rebadge',
  'inferred_reasoning',
  'absence_of_evidence',
  'identity_only',
]);

export const evidenceKindEnum = z.enum(EVIDENCE_KIND_VALUES);

// WHY: evidence_kind is OPTIONAL to tolerate legacy product.json rows
// rebuilt pre-upgrade (NULL on read). Forward LLM contract is enforced
// by the prompt (evidenceKindGuidance block), not the schema — mirrors
// how tier validation works (prompt lists tiers, schema accepts any string).
export const evidenceRefExtendedSchema = z.object({
  url: z.string(),
  tier: z.string(),
  confidence: z.number().int().min(0).max(100).default(0),
  supporting_evidence: z.string().max(280).default(''),
  evidence_kind: evidenceKindEnum.optional(),
});

export const evidenceRefsExtendedSchema = z.array(evidenceRefExtendedSchema).default([]);

// ── Prompt fragment ──────────────────────────────────────────────────

/**
 * Render the evidence prompt block with MIN_EVIDENCE_REFS bound.
 *
 * Defaults minEvidenceRefs to 1 for any non-positive-number input.
 * When `includeEvidenceKind: true`, appends the `evidenceKindGuidance`
 * global-prompt block so the LLM tags each ref with supporting_evidence
 * + evidence_kind. Off by default so CEF/PIF/carousel keep current behavior.
 *
 * @param {{ minEvidenceRefs?: number, includeEvidenceKind?: boolean }} [opts]
 * @returns {string}
 */
export function buildEvidencePromptBlock({ minEvidenceRefs, includeEvidenceKind = false } = {}) {
  const n = (typeof minEvidenceRefs === 'number' && minEvidenceRefs > 0)
    ? minEvidenceRefs
    : 1;
  const contract = resolvePromptTemplate(resolveGlobalPrompt('evidenceContract'), {
    MIN_EVIDENCE_REFS: String(n),
  });
  if (!includeEvidenceKind) return contract;
  return `${contract}\n\n${resolveGlobalPrompt('evidenceKindGuidance')}`;
}
