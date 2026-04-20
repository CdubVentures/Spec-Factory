/**
 * Shared evidence contract for finder LLMs (CEF, RDF; PIF excepted).
 *
 * Single source of truth for the evidence shape — features import
 * `evidenceRefsSchema` directly instead of re-declaring it locally.
 *
 * Shape: { url, tier, confidence } — confidence is per-source (0-100),
 * distinct from candidate-level confidence. Tier is pure metadata; the
 * prompt deliberately uses no preference or ranking language.
 */

import { z } from 'zod';
import { resolvePromptTemplate } from '../llm/resolvePromptTemplate.js';
import { resolveGlobalPrompt } from '../llm/prompts/globalPromptRegistry.js';

// ── Zod schema (universal shape) ─────────────────────────────────────

export const evidenceRefSchema = z.object({
  url: z.string(),
  tier: z.string(),
  confidence: z.number().int().min(0).max(100).default(0),
});

export const evidenceRefsSchema = z.array(evidenceRefSchema).default([]);

// ── Prompt fragment ──────────────────────────────────────────────────
// Template text lives in src/core/llm/prompts/globalPromptRegistry.js
// under key 'evidenceContract' so the user can edit it from the GUI.

/**
 * Render the evidence prompt block with MIN_EVIDENCE_REFS bound.
 *
 * Defaults minEvidenceRefs to 1 for any non-positive-number input
 * (undefined, null, 0, negative, non-number).
 *
 * @param {{ minEvidenceRefs?: number }} [opts]
 * @returns {string}
 */
export function buildEvidencePromptBlock({ minEvidenceRefs } = {}) {
  const n = (typeof minEvidenceRefs === 'number' && minEvidenceRefs > 0)
    ? minEvidenceRefs
    : 1;
  return resolvePromptTemplate(resolveGlobalPrompt('evidenceContract'), {
    MIN_EVIDENCE_REFS: String(n),
  });
}
