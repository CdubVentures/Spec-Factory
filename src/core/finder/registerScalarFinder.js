/**
 * registerScalarFinder — top-level factory for scalar field finders.
 *
 * Given a declarative registry entry + bespoke prompt/LLM-caller pair, wires
 * everything createVariantScalarFieldProducer needs with sensible defaults for
 * extractCandidate + satisfactionPredicate. Returns { runOnce, runLoop }.
 *
 * After this factory, each future scalar finder (sku, pricing, msrp, discontinued,
 * upc, ...) collapses to a ~20-LOC call:
 *
 *   const { runOnce, runLoop } = registerScalarFinder({
 *     finderName, fieldKey, valueKey, sourceType, phase, logPrefix,
 *     createCallLlm, buildPrompt, store,
 *   });
 *
 * The defaults exported with `_` prefixes are the test seam — they lock byte-identical
 * behavior against the inline logic RDF used pre-Phase-4 (Phase 1 characterization
 * cases 6, 7, 19–24).
 */

import { createVariantScalarFieldProducer } from './variantScalarFieldProducer.js';
import { isUnknownSentinel } from '../../shared/valueNormalizers.js';

function isUnknownCandidateValue(value) {
  if (value == null) return true;
  if (isUnknownSentinel(value)) return true;
  return String(value).trim() === '';
}

/**
 * Default extractCandidate — byte-identical to RDF's inline logic.
 *
 * @param {string} valueKey — which key on the LLM response carries the scalar
 * @returns {(llmResult: object) => { value, confidence, unknownReason, evidenceRefs, discoveryLog, isUnknown }}
 */
export function _defaultExtractCandidate(valueKey) {
  return (llmResult) => {
    const rawValue = String(llmResult?.[valueKey] || '').trim();
    const evidenceRefs = Array.isArray(llmResult?.evidence_refs) ? llmResult.evidence_refs : [];
    // WHY: Trust the LLM's overall confidence; the shared valueConfidencePrompt
    // fragment anchors it to a tier-based rubric at prompt time. Schema clamps 0-100.
    const confidence = Number.isFinite(llmResult?.confidence) ? llmResult.confidence : 0;
    const unknownReason = String(llmResult?.unknown_reason || '').trim();
    const isUnknown = rawValue === '' || isUnknownSentinel(rawValue);
    return {
      value: rawValue,
      confidence,
      unknownReason,
      evidenceRefs,
      discoveryLog: llmResult?.discovery_log,
      isUnknown,
    };
  };
}

/**
 * Default satisfactionPredicate — byte-identical to rdfLoopSatisfied.
 *
 * Stops retrying when EITHER:
 *   (a) LLM returned definitive unknown (unknown_reason present AND empty value)
 *   (b) publisher actually PUBLISHED the candidate (below_threshold /
 *       manual_override_locked / skipped all mean the gate wasn't cleared →
 *       retry with fresh evidence).
 */
export function _defaultSatisfactionPredicate(result) {
  if (!result) return false;
  if (result.candidate?.unknown_reason && isUnknownCandidateValue(result.candidate?.value)) return true;
  if (result.publishStatus === 'published') return true;
  return false;
}

export function registerScalarFinder(cfg = {}) {
  const {
    finderName, fieldKey, valueKey, sourceType, phase, logPrefix,
    createCallLlm, buildPrompt, store,
    extractCandidate, satisfactionPredicate, buildPublisherMetadata,
    buildUserMessage, defaultStaggerMs,
  } = cfg;

  // WHY: No defaults on logPrefix — roadmap flagged the collision risk
  // (e.g. 'pricing'.slice(0, 3) === 'pri'). Every registry entry declares
  // logPrefix explicitly.
  if (!finderName) throw new Error('registerScalarFinder: finderName required');
  if (!fieldKey) throw new Error('registerScalarFinder: fieldKey required');
  if (!valueKey) throw new Error('registerScalarFinder: valueKey required');
  if (!sourceType) throw new Error('registerScalarFinder: sourceType required');
  if (!phase) throw new Error('registerScalarFinder: phase required');
  if (!logPrefix) throw new Error('registerScalarFinder: logPrefix required');
  if (!createCallLlm) throw new Error('registerScalarFinder: createCallLlm required');
  if (!buildPrompt) throw new Error('registerScalarFinder: buildPrompt required');
  if (!store) throw new Error('registerScalarFinder: store required');

  return createVariantScalarFieldProducer({
    finderName,
    fieldKey,
    sourceType,
    phase,
    responseValueKey: valueKey,
    logPrefix,
    createCallLlm,
    buildPrompt,
    extractCandidate: extractCandidate || _defaultExtractCandidate(valueKey),
    mergeDiscovery: store.merge,
    readRuns: store.read,
    writeRuns: store.write,
    recalculateFromRuns: store.recalculateFromRuns,
    satisfactionPredicate: satisfactionPredicate || _defaultSatisfactionPredicate,
    buildPublisherMetadata,
    buildUserMessage,
    defaultStaggerMs,
  });
}
