function freezeContract(contract = {}) {
  return Object.freeze({ ...contract });
}

function requirePhaseFunction(name, value) {
  if (typeof value !== 'function') {
    throw new Error(`buildSourceFinalizationPhaseContext requires ${name}`);
  }
  return value;
}

export function buildSourceFinalizationPhaseContext({
  sourceResults,
  config,
  category,
  productId,
  logger,
  successfulSourceMetaByUrl,
  planner,
  frontierDb,
  repairSearchEnabled,
  repairDedupeRule,
  repairQueryByDomain,
  requiredFields,
  jobIdentityLock,
  normalizeHostTokenFn,
  hostFromHttpUrlFn,
  buildRepairSearchQueryFn,
  maybeEmitRepairQueryFn,
  sha256Fn,
  toFloatFn,
  artifactsByHost,
  adapterArtifacts,
  fetcherMode,
  llmSatisfiedFields,
  anchors,
  traceWriter,
  collectKnownCandidatesFromSourceFn,
  markSatisfiedLlmFieldsFn,
  bumpHostOutcomeFn,
  noteHostRetryTsFn,
  applyHostBudgetBackoffFn,
  resolveHostBudgetStateFn,
  runSourceResultsAppendPhaseFn,
  runSourceEvidenceIndexPhaseFn,
  runSourcePostFetchStatusPhaseFn,
  runSourceKnownCandidatesPhaseFn,
  runSourceConflictTelemetryPhaseFn,
  runSourceFrontierPersistencePhaseFn,
  runSourceArtifactAggregationPhaseFn,
  runSourceHostBudgetPhaseFn,
  runSourceProcessedTelemetryPhaseFn,
  buildSourceProcessedPayloadFn,
} = {}) {
  const runtimeContext = freezeContract({
    sourceResults,
    config,
    category,
    productId,
    logger,
    successfulSourceMetaByUrl,
    planner,
  });
  const repairQueryContext = freezeContract({
    frontierDb,
    repairSearchEnabled,
    repairDedupeRule,
    repairQueryByDomain,
    requiredFields,
    jobIdentityLock,
    normalizeHostTokenFn,
    hostFromHttpUrlFn,
    buildRepairSearchQueryFn,
    maybeEmitRepairQueryFn,
    sha256Fn,
    toFloatFn,
  });
  const artifactContext = freezeContract({
    artifactsByHost,
    adapterArtifacts,
    fetcherMode,
    llmSatisfiedFields,
    anchors,
    traceWriter,
  });
  const phaseFns = freezeContract({
    collectKnownCandidatesFromSourceFn,
    markSatisfiedLlmFieldsFn,
    bumpHostOutcomeFn,
    noteHostRetryTsFn,
    applyHostBudgetBackoffFn,
    resolveHostBudgetStateFn,
    runSourceResultsAppendPhaseFn,
    runSourceEvidenceIndexPhaseFn,
    runSourcePostFetchStatusPhaseFn,
    runSourceKnownCandidatesPhaseFn,
    runSourceConflictTelemetryPhaseFn,
    runSourceFrontierPersistencePhaseFn,
    runSourceArtifactAggregationPhaseFn,
    runSourceHostBudgetPhaseFn,
    runSourceProcessedTelemetryPhaseFn,
    buildSourceProcessedPayloadFn,
  });

  requirePhaseFunction('runSourceResultsAppendPhaseFn', phaseFns.runSourceResultsAppendPhaseFn);
  requirePhaseFunction('runSourceEvidenceIndexPhaseFn', phaseFns.runSourceEvidenceIndexPhaseFn);
  requirePhaseFunction('runSourcePostFetchStatusPhaseFn', phaseFns.runSourcePostFetchStatusPhaseFn);
  requirePhaseFunction('runSourceKnownCandidatesPhaseFn', phaseFns.runSourceKnownCandidatesPhaseFn);
  requirePhaseFunction('runSourceConflictTelemetryPhaseFn', phaseFns.runSourceConflictTelemetryPhaseFn);
  requirePhaseFunction('runSourceFrontierPersistencePhaseFn', phaseFns.runSourceFrontierPersistencePhaseFn);
  requirePhaseFunction('runSourceArtifactAggregationPhaseFn', phaseFns.runSourceArtifactAggregationPhaseFn);
  requirePhaseFunction('runSourceHostBudgetPhaseFn', phaseFns.runSourceHostBudgetPhaseFn);
  requirePhaseFunction('runSourceProcessedTelemetryPhaseFn', phaseFns.runSourceProcessedTelemetryPhaseFn);
  requirePhaseFunction('buildSourceProcessedPayloadFn', phaseFns.buildSourceProcessedPayloadFn);

  return Object.freeze({
    ...runtimeContext,
    ...repairQueryContext,
    ...artifactContext,
    ...phaseFns,
    runtimeContext,
    repairQueryContext,
    artifactContext,
    phaseFns,
  });
}
