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
import { resolveGlobalPrompt } from '../llm/prompts/globalPromptRegistry.js';

// ── Zod schema (universal shape) ─────────────────────────────────────

export const valueConfidenceSchema = z.number().int().min(0).max(100);

// ── Prompt fragment ──────────────────────────────────────────────────
// Template text lives in src/core/llm/prompts/globalPromptRegistry.js
// under key 'valueConfidenceRubric' so the user can edit it from the GUI.

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
  return resolveGlobalPrompt('valueConfidenceRubric');
}
