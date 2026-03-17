// WHY: Core/deep correctness gates. Core facts require high-tier evidence;
// deep claims accept all tiers but cluster numerics. Community evidence
// NEVER overwrites core facts.

/**
 * Classify a field as core_fact or deep_claim.
 *
 * Core: field is in fieldRules.core_fields[] OR has evidence_tier_minimum <= 2.
 * Deep: everything else.
 */
export function classifyFieldCoreDeep(fieldKey, fieldRules) {
  const coreFields = fieldRules?.core_fields || [];
  if (coreFields.includes(fieldKey)) return 'core_fact';

  const fieldDef = fieldRules?.fields?.[fieldKey];
  if (fieldDef && typeof fieldDef.evidence_tier_minimum === 'number' && fieldDef.evidence_tier_minimum <= 2) {
    return 'core_fact';
  }

  return 'deep_claim';
}

/**
 * Apply tier acceptance policy based on field classification.
 *
 * Core facts: require tier 1 or 2, OR corroboration_count >= 2.
 * Community (tier 4+) NEVER overwrites existing core fact.
 * Deep claims: accept any tier.
 */
export function applyTierAcceptancePolicy(candidate, fieldClassification) {
  const tier = candidate?.tier ?? 99;
  const corroboration = candidate?.corroboration_count ?? 0;

  if (fieldClassification === 'deep_claim') {
    return { accepted: true, reason: 'deep_claim_all_tiers_accepted' };
  }

  // Core fact rules — community (tier 4+) NEVER accepted for core facts
  if (tier >= 4) {
    return { accepted: false, reason: 'community_tier_rejected_for_core_fact' };
  }

  if (tier <= 2) {
    return { accepted: true, reason: `tier_${tier}_accepted_for_core` };
  }

  // Tier 3: accepted only with corroboration >= 2
  if (corroboration >= 2) {
    return { accepted: true, reason: `tier_${tier}_accepted_with_corroboration_${corroboration}` };
  }

  return { accepted: false, reason: `tier_${tier}_rejected_for_core_fact_needs_corroboration` };
}

/**
 * Cluster deep numeric claims to median/range with outlier detection.
 */
export function clusterDeepNumericClaims(claims) {
  const values = (claims || [])
    .map(c => Number(c?.value))
    .filter(v => Number.isFinite(v))
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return { median: 0, range: [0, 0], outliers: [], corroboration_count: 0 };
  }

  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 === 0
    ? (values[mid - 1] + values[mid]) / 2
    : values[mid];

  const range = [values[0], values[values.length - 1]];

  // Outlier detection: values > 2x median or < 0.5x median
  const outliers = claims.filter(c => {
    const v = Number(c?.value);
    if (!Number.isFinite(v) || median === 0) return false;
    return v > median * 2 || v < median * 0.5;
  });

  return {
    median,
    range,
    outliers,
    corroboration_count: values.length,
  };
}

/**
 * Integration orchestrator: apply core/deep gates to consensus output.
 * Wraps classifyFieldCoreDeep + applyTierAcceptancePolicy + clusterDeepNumericClaims.
 */
export function applyCoreDeepGates({ consensus, fieldRulesEngine, config = {} }) {

  const fieldRules = fieldRulesEngine?.getCoreDeepFieldRules?.() || { core_fields: [], fields: {} };

  for (const field of Object.keys(consensus.provenance)) {
    const prov = consensus.provenance[field];

    // Skip anchor-locked and identity fields
    if (prov.anchor_locked) continue;

    const classification = classifyFieldCoreDeep(field, fieldRules);
    prov.field_classification = classification;

    const currentValue = consensus.fields[field];
    const isUnk = !currentValue || currentValue === 'unk';

    // If field is already unk, just annotate and move on
    if (isUnk) {
      prov.acceptance_gate_result = { accepted: false, reason: 'no_value_to_gate' };
      continue;
    }

    // Determine best tier from evidence
    const evidence = Array.isArray(prov.evidence) ? prov.evidence : [];
    const bestTier = evidence.length > 0
      ? Math.min(...evidence.map(e => e.tier ?? 99))
      : 99;

    // Build gate candidate
    const gateCandidate = {
      tier: bestTier,
      corroboration_count: prov.approved_confirmations ?? 0,
    };

    const gateResult = applyTierAcceptancePolicy(gateCandidate, classification);
    prov.acceptance_gate_result = gateResult;

    if (!gateResult.accepted) {
      consensus.fields[field] = 'unk';
      prov.gate_rejected = true;
      prov.value = 'unk';
    }

    // For deep numeric fields, attach claim clustering
    if (classification === 'deep_claim' && evidence.length > 0) {
      const numericCandidates = (consensus.candidates[field] || [])
        .filter(c => c.value !== undefined && c.value !== 'unk');
      if (numericCandidates.length > 1) {
        prov.deep_claim_cluster = clusterDeepNumericClaims(numericCandidates);
      }
    }
  }

  return consensus;
}
