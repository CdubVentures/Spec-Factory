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

// ── Zod schema (universal shape) ─────────────────────────────────────

export const evidenceRefSchema = z.object({
  url: z.string(),
  tier: z.string(),
  confidence: z.number().int().min(0).max(100).default(0),
});

export const evidenceRefsSchema = z.array(evidenceRefSchema).default([]);

// ── Prompt fragment ──────────────────────────────────────────────────

export const EVIDENCE_PROMPT_FRAGMENT = `Evidence requirements (CRITICAL — publisher will reject low-evidence candidates):
- Provide AT LEAST {{MIN_EVIDENCE_REFS}} evidence entry with a source URL
- Tag each source with a tier (classification only, no ranking)
- Rate your confidence (0-100) that each source supports the claim

Source tiers:
- tier1: manufacturer / brand-official / press release
- tier2: professional testing lab / review lab
- tier3: authorized retailer / marketplace
- tier4: community / forum / blog / user-generated
- tier5: specs aggregator / product database
- other: anything that doesn't fit the above`;

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
  return resolvePromptTemplate(EVIDENCE_PROMPT_FRAGMENT, {
    MIN_EVIDENCE_REFS: String(n),
  });
}
