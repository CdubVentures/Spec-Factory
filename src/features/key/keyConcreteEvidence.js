/**
 * keyConcreteEvidence — the "we've done well, stop bundling" gate.
 *
 * Routes through the publisher's deterministic bucket evaluator
 * (evaluateFieldBuckets) with stricter thresholds than the publish gate.
 * A field is "concrete" when its bucket would publish under the passenger-
 * exclude knobs (default 95 confidence / 3 evidence refs), meaning:
 *
 *   - buildPassengers drops it from the passenger pool (peer stops riding
 *     on other primaries' runs).
 *   - The UI summary row's Concrete column shows a checkmark.
 *
 * Both paths call this helper so UI and runtime behavior can never drift.
 * "Resolved" (via publishConfidenceThreshold) is a looser bar; concrete is
 * stricter and explicitly signals "no more LLM cycles needed on this peer."
 */

import { evaluateFieldBuckets } from '../publisher/publish/evidenceGate.js';

/**
 * @param {object} opts
 * @param {object} opts.specDb     per-category SpecDb; exposes listFieldBuckets + countPooledQualifyingEvidenceByFingerprint
 * @param {string} opts.productId
 * @param {string} opts.fieldKey
 * @param {object} opts.fieldRule  compiled field rule for the field
 * @param {number} opts.excludeConf  passengerExcludeAtConfidence knob (0-100)
 * @param {number} opts.excludeEvd   passengerExcludeMinEvidence knob (0+)
 * @returns {boolean} true when the bucket publishes under the stricter thresholds
 */
export function isConcreteEvidence({ specDb, productId, fieldKey, fieldRule, excludeConf, excludeEvd }) {
  if (!excludeConf || !excludeEvd) return false;
  if (!specDb || typeof specDb.listFieldBuckets !== 'function') return false;

  const result = evaluateFieldBuckets({
    specDb,
    productId,
    fieldKey,
    fieldRule,
    variantId: null, // keyFinder is product-scoped; passenger peers are always variant-null
    threshold: Number(excludeConf) / 100,
    requiredOverride: Number(excludeEvd),
  });
  return result.publishedValue !== undefined;
}
