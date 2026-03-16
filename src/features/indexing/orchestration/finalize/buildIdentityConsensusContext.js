export function buildIdentityConsensusContext({
  sourceResults = [],
  productId = '',
  runId = '',
  job = {},
  categoryConfig,
  fieldOrder = [],
  anchors = {},
  category = '',
  config = {},
  runtimeFieldRulesEngine = null,
  evaluateIdentityGateFn,
  buildIdentityReportFn,
  bestIdentityFromSourcesFn,
  buildIdentityObjectFn,
  buildSourceSummaryFn,
  mergeAnchorConflictListsFn,
  executeConsensusPhaseFn,
} = {}) {
  const identityGate = evaluateIdentityGateFn(sourceResults);
  const identityConfidence = identityGate.certainty;
  const identityReport = buildIdentityReportFn({
    productId,
    runId,
    sourceResults,
    identityGate,
  });
  const extractedIdentity = bestIdentityFromSourcesFn(sourceResults, job.identityLock || {});
  const identity = buildIdentityObjectFn(job, extractedIdentity, {
    allowDerivedVariant: Boolean(identityGate.validated),
  });
  const sourceSummary = buildSourceSummaryFn(sourceResults);
  const allAnchorConflicts = mergeAnchorConflictListsFn(sourceResults.map((source) => source.anchorCheck));
  const anchorMajorConflictsCount = allAnchorConflicts.filter((item) => item.severity === 'MAJOR').length;

  const consensus = executeConsensusPhaseFn({
    sourceResults,
    categoryConfig,
    fieldOrder,
    anchors,
    identityLock: job.identityLock || {},
    productId,
    category,
    config,
    fieldRulesEngine: runtimeFieldRulesEngine,
  });

  return {
    identityGate,
    identityConfidence,
    identityReport,
    extractedIdentity,
    identity,
    sourceSummary,
    allAnchorConflicts,
    anchorMajorConflictsCount,
    consensus,
  };
}
