/**
 * Shared evidence-citation prompt fragment for finder LLMs (CEF, PIF).
 *
 * Contract: teach the LLM how many URLs to cite and how to classify each by
 * tier. Tier is pure metadata — the fragment deliberately uses no preference
 * or ranking language. Publisher gates on `min_evidence_refs` count only.
 */

import { resolvePromptTemplate } from '../llm/resolvePromptTemplate.js';

export const EVIDENCE_PROMPT_FRAGMENT = `Evidence requirements (CRITICAL — publisher will reject low-evidence candidates):
- Provide AT LEAST {{MIN_EVIDENCE_REFS}} evidence entry with a source URL
- Tag each source with a tier (classification only, no ranking)

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
