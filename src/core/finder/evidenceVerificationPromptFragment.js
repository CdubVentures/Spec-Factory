/**
 * Evidence URL verification fragment for finder LLM prompts.
 *
 * Paired with evidencePromptFragment — this one tells the model it must
 * personally fetch every URL it cites (no synthesising from training), and
 * warns that the publisher will HEAD-check each URL and strip 4xx/5xx before
 * accepting the candidate. Template text lives in the global prompt registry
 * under 'evidenceVerification' so the user can edit it from the GUI.
 */

import { resolveGlobalPrompt } from '../llm/prompts/globalPromptRegistry.js';

/**
 * @param {{ enabled?: boolean }} [opts]
 * @returns {string}
 */
export function buildEvidenceVerificationPromptBlock({ enabled = true } = {}) {
  if (enabled === false) return '';
  return resolveGlobalPrompt('evidenceVerification');
}
