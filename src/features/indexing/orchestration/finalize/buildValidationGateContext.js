export function buildValidationGateContext({
  normalized = { fields: {}, quality: {} },
  requiredFields = [],
  fieldOrder = [],
  categoryConfig = { schema: { editorial_fields: [] } },
  identityConfidence = 0,
  provenance = {},
  allAnchorConflicts = [],
  consensus = {},
  identityGate = {},
  config = {},
  targets = {},
  anchorMajorConflictsCount = 0,
  criticalFieldsBelowPassTarget = [],
  identityFull = false,
  identityPublishThreshold = 0.75,
  computeCompletenessRequiredFn,
  computeCoverageOverallFn,
  computeConfidenceFn,
  evaluateValidationGateFn,
} = {}) {
  const completenessStats = computeCompletenessRequiredFn(normalized, requiredFields);
  const coverageStats = computeCoverageOverallFn({
    fields: normalized.fields,
    fieldOrder,
    editorialFields: categoryConfig.schema?.editorial_fields || [],
  });

  const confidence = computeConfidenceFn({
    identityConfidence,
    provenance,
    anchorConflictsCount: allAnchorConflicts.length,
    agreementScore: consensus.agreementScore || 0,
  });

  const gate = evaluateValidationGateFn({
    identityGateValidated: identityGate.validated,
    identityConfidence,
    anchorMajorConflictsCount,
    completenessRequired: completenessStats.completenessRequired,
    targetCompleteness: targets.targetCompleteness,
    confidence,
    targetConfidence: targets.targetConfidence,
    criticalFieldsBelowPassTarget,
  });

  gate.coverageOverallPercent = Number.parseFloat((coverageStats.coverageOverall * 100).toFixed(2));
  const publishable =
    gate.validated &&
    identityFull &&
    identityConfidence >= identityPublishThreshold &&
    !identityGate.needsReview;
  const publishBlockers = [
    ...new Set([...(gate.validated ? [] : gate.reasons || []), ...(identityGate.reasonCodes || [])]),
  ].filter(Boolean);
  if (!publishable && publishBlockers.length === 0) {
    publishBlockers.push(gate.validatedReason || 'MODEL_AMBIGUITY_ALERT');
  }

  normalized.quality.completeness_required = completenessStats.completenessRequired;
  normalized.quality.coverage_overall = coverageStats.coverageOverall;
  normalized.quality.confidence = confidence;
  normalized.quality.validated = gate.validated;
  normalized.quality.notes = gate.reasons;

  return {
    completenessStats,
    coverageStats,
    confidence,
    gate,
    publishable,
    publishBlockers,
  };
}
