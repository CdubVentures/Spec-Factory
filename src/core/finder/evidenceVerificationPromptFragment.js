/**
 * Evidence URL verification fragment for finder LLM prompts.
 *
 * Paired with evidencePromptFragment — this one tells the model it must
 * personally fetch every URL it cites (no synthesising from training), and
 * warns that the publisher will HEAD-check each URL and strip 4xx/5xx before
 * accepting the candidate. Catches the "lazy reuse of a plausible-looking
 * URL" failure mode seen on the Corsair M75 Air Wireless CEF run.
 */

export const EVIDENCE_VERIFICATION_PROMPT_FRAGMENT = `Evidence verification (MANDATORY):
- Every URL you cite in evidence_refs MUST be one you personally fetched with your web tool during this session.
- Do NOT synthesize URLs from training knowledge or pattern-match retailer URL shapes. URLs from the past may have moved or been restructured — only cite what loads NOW.
- Fetch each URL at least once and confirm it returns a 2xx status. If it 404s, redirects to an unrelated page, or times out, omit it entirely.
- Fewer verified sources is better than many unverified sources. The publisher HEAD-checks every URL you cite and strips 4xx/5xx automatically, so citing a hallucinated URL gets you nothing.`;

/**
 * @param {{ enabled?: boolean }} [opts]
 * @returns {string}
 */
export function buildEvidenceVerificationPromptBlock({ enabled = true } = {}) {
  if (enabled === false) return '';
  return EVIDENCE_VERIFICATION_PROMPT_FRAGMENT;
}
