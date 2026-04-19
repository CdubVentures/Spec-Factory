/**
 * Release Date Finder — variant-aware orchestrator (thin wrapper).
 *
 * Delegates to the shared `variantScalarFieldProducer` factory
 * (src/core/finder/variantScalarFieldProducer.js). Contributes only the
 * RDF-bespoke bits: LLM adapter, response schema extraction, JSON store
 * functions, and the RDF loop-satisfaction predicate.
 *
 * Exports:
 *   - runReleaseDateFinder       — single-shot per-variant
 *   - runReleaseDateFinderLoop   — retries per variant up to perVariantAttemptBudget
 *
 * Publisher gate: valid candidates go to `submitCandidate()`, which validates
 * evidence (min_evidence_refs, tier_preference) before promoting to
 * `fields.release_date`.
 */

import { createVariantScalarFieldProducer } from '../../core/finder/variantScalarFieldProducer.js';
import {
  createReleaseDateFinderCallLlm,
  buildReleaseDateFinderPrompt,
} from './releaseDateLlmAdapter.js';
import {
  readReleaseDates,
  mergeReleaseDateDiscovery,
} from './releaseDateStore.js';

function extractCandidate(llmResult) {
  const releaseDate = String(llmResult?.release_date || '').trim();
  const evidenceRefs = Array.isArray(llmResult?.evidence_refs) ? llmResult.evidence_refs : [];
  // WHY: Trust the LLM's overall confidence. The shared valueConfidencePrompt
  // fragment anchors the number to a tier-based rubric against cited evidence,
  // so the LLM's self-rating is calibrated at prompt time. Schema clamps 0-100.
  const confidence = Number.isFinite(llmResult?.confidence) ? llmResult.confidence : 0;
  const unknownReason = String(llmResult?.unknown_reason || '').trim();
  const isUnknown = releaseDate === '' || releaseDate.toLowerCase() === 'unk';
  return {
    value: releaseDate,
    confidence,
    unknownReason,
    evidenceRefs,
    discoveryLog: llmResult?.discovery_log,
    isUnknown,
  };
}

/**
 * RDF loop satisfaction predicate:
 *  - stop on definitive unknown (LLM said "unk" with a reason → no retry helps)
 *  - stop once the publisher actually PUBLISHED the candidate — weaker
 *    outcomes (below_threshold, manual_override_locked, skipped) mean the
 *    bar isn't cleared; the loop retries with fresh evidence unless budget
 *    is exhausted.
 */
function rdfLoopSatisfied(result) {
  if (!result) return false;
  if (result.candidate?.unknown_reason && result.candidate?.value === '') return true;
  if (result.publishStatus === 'published') return true;
  return false;
}

const { runOnce, runLoop } = createVariantScalarFieldProducer({
  finderName: 'releaseDateFinder',
  fieldKey: 'release_date',
  sourceType: 'release_date_finder',
  phase: 'releaseDateFinder',
  responseValueKey: 'release_date',
  logPrefix: 'rdf',
  createCallLlm: createReleaseDateFinderCallLlm,
  buildPrompt: buildReleaseDateFinderPrompt,
  extractCandidate,
  mergeDiscovery: mergeReleaseDateDiscovery,
  readRuns: readReleaseDates,
  satisfactionPredicate: rdfLoopSatisfied,
});

export const runReleaseDateFinder = runOnce;
export const runReleaseDateFinderLoop = runLoop;
