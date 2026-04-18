/**
 * Shared value-level confidence contract for finder LLMs (CEF, RDF; PIF excepted).
 *
 * Single source of truth for the LLM's overall per-value confidence — features
 * import `valueConfidenceSchema` directly instead of re-declaring it locally.
 *
 * Shape: integer 0-100, with a tier-anchored rubric so the LLM calibrates its
 * number against the evidence strength it cites (rather than inflating toward
 * 100). This is distinct from per-source `evidence_refs[].confidence` — that
 * rates how well an individual URL supports the claim; this rates the finder's
 * rolled-up judgment about the returned value as a whole.
 */

import { z } from 'zod';

// ── Zod schema (universal shape) ─────────────────────────────────────

export const valueConfidenceSchema = z.number().int().min(0).max(100);

// ── Prompt fragment ──────────────────────────────────────────────────

export const VALUE_CONFIDENCE_PROMPT_FRAGMENT = `Overall confidence (0-100):
Rate your overall confidence in this value, calibrated against the evidence you cite.
- 90+:   multiple tier1 sources agree, OR a single tier1 source is explicit and unambiguous
- 70-89: a single tier1 source without corroboration, OR multiple tier2/tier3 sources agree
- 50-69: tier2/tier3 sources with partial agreement or minor ambiguity
- 30-49: tier4/tier5 only, OR conflicting signals
- 0-29:  weak, inferred, or contradicted evidence
Do not inflate confidence above what your cited evidence supports.`;

/**
 * Render the overall-confidence prompt block.
 *
 * Currently takes no parameters — the rubric is universal across finders. If a
 * future finder needs a field-specific rubric wrinkle (e.g. RDF's "prefer
 * returning 'unk' at <50"), add that to the field-specific prompt template,
 * not here.
 *
 * @returns {string}
 */
export function buildValueConfidencePromptBlock() {
  return VALUE_CONFIDENCE_PROMPT_FRAGMENT;
}
