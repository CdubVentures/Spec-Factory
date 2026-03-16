export function runInferencePolicyPhase({
  sourceResults = [],
  categoryConfig = {},
  normalized = { fields: {} },
  provenance = {},
  logger = null,
  fieldsBelowPassTarget = [],
  criticalFieldsBelowPassTarget = [],
  aggregateTemporalSignalsFn,
  applyInferencePoliciesFn,
} = {}) {
  const temporalEvidence = aggregateTemporalSignalsFn(sourceResults, 40);
  const inferenceResult = applyInferencePoliciesFn({
    categoryConfig,
    normalized,
    provenance,
    summaryHint: {
      temporal_evidence: temporalEvidence,
    },
    sourceResults,
    logger,
  });
  let nextFieldsBelowPassTarget = fieldsBelowPassTarget;
  let nextCriticalFieldsBelowPassTarget = criticalFieldsBelowPassTarget;

  if ((inferenceResult.filled_fields || []).length > 0) {
    const belowSet = new Set(fieldsBelowPassTarget || []);
    const criticalSet = new Set(criticalFieldsBelowPassTarget || []);
    for (const field of inferenceResult.filled_fields) {
      belowSet.delete(field);
      criticalSet.delete(field);
    }
    nextFieldsBelowPassTarget = [...belowSet];
    nextCriticalFieldsBelowPassTarget = [...criticalSet];
  }

  return {
    temporalEvidence,
    inferenceResult,
    fieldsBelowPassTarget: nextFieldsBelowPassTarget,
    criticalFieldsBelowPassTarget: nextCriticalFieldsBelowPassTarget,
  };
}
