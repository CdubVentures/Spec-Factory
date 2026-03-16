import { buildSourceExtractionPhaseCallsiteContext } from './buildSourceExtractionPhaseCallsiteContext.js';
import { buildSourceExtractionPhaseContext } from './buildSourceExtractionPhaseContext.js';
import { buildSourceFetchPhaseCallsiteContext } from './buildSourceFetchPhaseCallsiteContext.js';
import { buildSourceFetchPhaseContext } from './buildSourceFetchPhaseContext.js';
import { buildSourceFetchProcessingDispatchPhaseCallsiteContext } from './buildSourceFetchProcessingDispatchPhaseCallsiteContext.js';
import { buildSourceFetchProcessingDispatchContext } from './buildSourceFetchProcessingDispatchContext.js';
import { buildSourcePreflightDispatchPhaseCallsiteContext } from './buildSourcePreflightDispatchPhaseCallsiteContext.js';
import { buildSourcePreflightDispatchContext } from './buildSourcePreflightDispatchContext.js';
import { buildSourcePreflightPhaseCallsiteContext } from './buildSourcePreflightPhaseCallsiteContext.js';
import { buildSourcePreflightPhaseContext } from './buildSourcePreflightPhaseContext.js';
import { buildSourceProcessingPhaseCallsiteContext } from './buildSourceProcessingPhaseCallsiteContext.js';
import { buildSourceProcessingPhaseContext } from './buildSourceProcessingPhaseContext.js';
import { buildSourceSkipBeforeFetchPhaseCallsiteContext } from './buildSourceSkipBeforeFetchPhaseCallsiteContext.js';
import { buildSourceSkipBeforeFetchPhaseContext } from './buildSourceSkipBeforeFetchPhaseContext.js';
import { buildSourceSkipDispatchPhaseCallsiteContext } from './buildSourceSkipDispatchPhaseCallsiteContext.js';
import { buildSourceSkipDispatchContext } from './buildSourceSkipDispatchContext.js';
import { buildSourceArtifactsContextPhase } from './buildSourceArtifactsContextPhase.js';
import { buildSourceProcessedPayload } from './buildSourceProcessedPayload.js';
import { collectKnownCandidatesFromSource } from './collectKnownCandidatesFromSource.js';
import { maybeEmitRepairQuery } from './maybeEmitRepairQuery.js';
import { runPhase08SourceIngestionPhase } from './runPhase08SourceIngestionPhase.js';
import { runSourceArtifactAggregationPhase } from './runSourceArtifactAggregationPhase.js';
import { runSourceConflictTelemetryPhase } from './runSourceConflictTelemetryPhase.js';
import { runSourceEvidenceIndexPhase } from './runSourceEvidenceIndexPhase.js';
import { runSourceExtractionDispatchPhase } from './runSourceExtractionDispatchPhase.js';
import { runSourceExtractionPhase } from './runSourceExtractionPhase.js';
import { runSourceFetchDispatchPhase } from './runSourceFetchDispatchPhase.js';
import { runSourceFetchPhase } from './runSourceFetchPhase.js';
import { runSourceFetchProcessingDispatchPhase } from './runSourceFetchProcessingDispatchPhase.js';
import { runSourceFinalizationPhase } from './runSourceFinalizationPhase.js';
import { runSourceFrontierPersistencePhase } from './runSourceFrontierPersistencePhase.js';
import { runSourceHostBudgetPhase } from './runSourceHostBudgetPhase.js';
import { runSourceIdentityCandidateMergePhase } from './runSourceIdentityCandidateMergePhase.js';
import { runSourceIdentityEvaluationPhase } from './runSourceIdentityEvaluationPhase.js';
import { runSourceKnownCandidatesPhase } from './runSourceKnownCandidatesPhase.js';
import { runSourceLlmFieldCandidatePhase } from './runSourceLlmFieldCandidatePhase.js';
import { runSourcePostFetchStatusPhase } from './runSourcePostFetchStatusPhase.js';
import { runSourcePreflightPhase } from './runSourcePreflightPhase.js';
import { runSourceProcessedTelemetryPhase } from './runSourceProcessedTelemetryPhase.js';
import { runSourceProcessingDispatchPhase } from './runSourceProcessingDispatchPhase.js';
import { runSourceProcessingPhase } from './runSourceProcessingPhase.js';
import { runSourceResultsAppendPhase } from './runSourceResultsAppendPhase.js';
import { runSourceSkipBeforeFetchPhase } from './runSourceSkipBeforeFetchPhase.js';
import { runSourceSkipDispatchPhase } from './runSourceSkipDispatchPhase.js';

export function buildProcessPlannerQueueExecutionContexts(context = {}) {
  const {
    runtimeOverrides = {},
    maybeApplyBlockedDomainCooldown,
    blockedDomainHitCount,
    blockedDomainThreshold,
    blockedDomainsApplied,
    planner,
    logger,
    normalizeHostToken,
    hostFromHttpUrl,
    isRobotsTxtUrl,
    isSitemapUrl,
    hasSitemapXmlSignals,
    isDiscoveryOnlySourceUrl,
    mineEndpointSignals,
    categoryConfig,
    config = {},
    buildSiteFingerprint,
    isLikelyIndexableEndpointUrl,
    isSafeManufacturerFollowupUrl,
    extractCandidatesFromPage,
    job = {},
    adapterManager,
    runId,
    dedupeCandidates,
    buildEvidencePack,
    llmTargetFields, // WHY: legacy bridge name passed through to extraction phase
    fetcherMode,
    productId,
    category,
    sha256,
    deterministicParser,
    componentResolver,
    llmSatisfiedFields,
    anchors,
    isIdentityLockedField,
    isAnchorLocked,
    extractCandidatesLLM,
    goldenExamples,
    llmContext,
    runtimeFieldRulesEngine,
    shouldQueueLlmRetry,
    llmRetryReasonByUrl,
    phase08BatchRows,
    mergePhase08Rows,
    enrichFieldCandidatesWithEvidenceRefs,
    extractTemporalSignals,
    buildCandidateFieldMap,
    evaluateAnchorConflicts,
    evaluateSourceIdentity,
    applyIdentityGateToCandidates,
    computeParserHealth,
    sourceResults,
    successfulSourceMetaByUrl,
    frontierDb,
    repairSearchEnabled,
    repairDedupeRule,
    repairQueryByDomain,
    requiredFields,
    buildRepairSearchQuery,
    toFloat,
    artifactsByHost,
    adapterArtifacts,
    markSatisfiedLlmFields,
    bumpHostOutcome,
    noteHostRetryTs,
    applyHostBudgetBackoff,
    resolveHostBudgetState,
    traceWriter,
    buildSourceFetchClassificationPhase,
    classifyFetchOutcome,
    runSourceArtifactsPhase,
    runArtifactsBase,
    storage,
    buildDomSnippetArtifact,
    toInt,
    screenshotExtension,
    screenshotMimeType,
    sha256Buffer,
    fetcher,
    fetchHostConcurrencyGate,
    fetchWithModeFn,
    runWithRetry,
    resumeFetchFailedUrls,
    resumeCooldownSkippedUrls,
    syncRuntimeOverrides,
    applyRuntimeOverridesToPlanner,
    runtimeControlKey,
    wait,
    startMs,
    ensureHostBudgetRow,
    hostBudgetByHost,
    attemptedSourceUrls,
  } = context;

  const sourceSkipBeforeFetchPhaseContext = buildSourceSkipBeforeFetchPhaseContext({
    ...buildSourceSkipBeforeFetchPhaseCallsiteContext({
      logger,
      resumeCooldownSkippedUrls,
      frontierDb,
      noteHostRetryTsFn: noteHostRetryTs,
      resolveHostBudgetStateFn: resolveHostBudgetState,
    }),
  });

  const sourceSkipDispatchContext = buildSourceSkipDispatchContext({
    ...buildSourceSkipDispatchPhaseCallsiteContext({
      runtimeOverrides,
      context: sourceSkipBeforeFetchPhaseContext,
      runSourceSkipBeforeFetchPhaseFn: runSourceSkipBeforeFetchPhase,
    }),
  });

  const sourcePreflightPhaseContext = buildSourcePreflightPhaseContext({
    ...buildSourcePreflightPhaseCallsiteContext({
      syncRuntimeOverridesFn: syncRuntimeOverrides,
      applyRuntimeOverridesToPlannerFn: applyRuntimeOverridesToPlanner,
      planner,
      llmContext,
      logger,
      runtimeControlKey,
      waitFn: wait,
      nowMsFn: () => Date.now(),
      startMs,
      maxRunSeconds: config.maxRunSeconds,
      normalizeHostTokenFn: normalizeHostToken,
      hostFromHttpUrlFn: hostFromHttpUrl,
      ensureHostBudgetRowFn: ensureHostBudgetRow,
      hostBudgetByHost,
      attemptedSourceUrls,
    }),
  });

  const sourcePreflightDispatchContext = buildSourcePreflightDispatchContext({
    ...buildSourcePreflightDispatchPhaseCallsiteContext({
      context: sourcePreflightPhaseContext,
      runSourcePreflightPhaseFn: runSourcePreflightPhase,
    }),
  });

  const sourceFetchPhaseContext = buildSourceFetchPhaseContext({
    ...buildSourceFetchPhaseCallsiteContext({
      fetcher,
      fetcherMode,
      config,
      logger,
      fetchHostConcurrencyGate,
      fetchWithModeFn,
      runWithRetryFn: runWithRetry,
      classifyFetchOutcomeFn: classifyFetchOutcome,
      bumpHostOutcomeFn: bumpHostOutcome,
      applyHostBudgetBackoffFn: applyHostBudgetBackoff,
      resolveHostBudgetStateFn: resolveHostBudgetState,
      toIntFn: toInt,
      resumeFetchFailedUrls,
      frontierDb,
      productId,
      maybeApplyBlockedDomainCooldownFn: maybeApplyBlockedDomainCooldown,
      repairQueryContext: {
        repairSearchEnabled,
        repairDedupeRule,
        repairQueryByDomain,
        config,
        requiredFields,
        jobIdentityLock: job.identityLock || {},
        logger,
        normalizeHostTokenFn: normalizeHostToken,
        hostFromHttpUrlFn: hostFromHttpUrl,
        buildRepairSearchQueryFn: buildRepairSearchQuery,
      },
      maybeEmitRepairQueryFn: maybeEmitRepairQuery,
      blockedDomainHitCount,
      blockedDomainThreshold,
      blockedDomainsApplied,
      planner,
      normalizeHostTokenFn: normalizeHostToken,
      hostFromHttpUrlFn: hostFromHttpUrl,
      traceWriter,
    }),
  });

  const sourceProcessingPhaseContext = buildSourceProcessingPhaseContext({
    ...buildSourceProcessingPhaseCallsiteContext({
      buildSourceFetchClassificationPhaseFn: buildSourceFetchClassificationPhase,
      classifyFetchOutcomeFn: classifyFetchOutcome,
      runSourceArtifactsPhaseFn: runSourceArtifactsPhase,
      runSourceExtractionFn: async (phasePayload = {}) => {
        const sourceExtractionPhaseState = await runSourceExtractionDispatchPhase({
          phasePayload,
          phaseState: phasePayload,
          context: sourceExtractionPhaseContext,
          runSourceExtractionPhaseFn: runSourceExtractionPhase,
        });
        return sourceExtractionPhaseState;
      },
      runArtifactsBase,
      config,
      storage,
      logger,
      traceWriter,
      buildDomSnippetArtifactFn: buildDomSnippetArtifact,
      toIntFn: toInt,
      screenshotExtensionFn: screenshotExtension,
      screenshotMimeTypeFn: screenshotMimeType,
      sha256Fn: sha256,
      sha256BufferFn: sha256Buffer,
    }),
  });

  const sourceExtractionPhaseContext = buildSourceExtractionPhaseContext({
    ...buildSourceExtractionPhaseCallsiteContext({
      maybeApplyBlockedDomainCooldownFn: maybeApplyBlockedDomainCooldown,
      blockedDomainHitCount,
      blockedDomainThreshold,
      blockedDomainsApplied,
      planner,
      logger,
      normalizeHostTokenFn: normalizeHostToken,
      hostFromHttpUrlFn: hostFromHttpUrl,
      isRobotsTxtUrlFn: isRobotsTxtUrl,
      isSitemapUrlFn: isSitemapUrl,
      hasSitemapXmlSignalsFn: hasSitemapXmlSignals,
      isDiscoveryOnlySourceUrlFn: isDiscoveryOnlySourceUrl,
      mineEndpointSignalsFn: mineEndpointSignals,
      categoryConfig,
      config,
      buildSiteFingerprintFn: buildSiteFingerprint,
      isLikelyIndexableEndpointUrlFn: isLikelyIndexableEndpointUrl,
      isSafeManufacturerFollowupUrlFn: isSafeManufacturerFollowupUrl,
      extractCandidatesFromPageFn: extractCandidatesFromPage,
      jobIdentityLock: job.identityLock || {},
      adapterManager,
      job,
      runId,
      dedupeCandidatesFn: dedupeCandidates,
      buildEvidencePackFn: buildEvidencePack,
      llmTargetFields, // WHY: legacy bridge name passed through to extraction phase
      fetcherMode,
      productId,
      category,
      sha256Fn: sha256,
      deterministicParser,
      componentResolver,
      llmSatisfiedFields,
      anchors,
      isIdentityLockedFieldFn: isIdentityLockedField,
      isAnchorLockedFn: isAnchorLocked,
      runtimeOverrides,
      extractCandidatesLLMFn: extractCandidatesLLM,
      goldenExamples,
      llmContext,
      runtimeFieldRulesEngine,
      shouldQueueLlmRetryFn: shouldQueueLlmRetry,
      llmRetryReasonByUrl,
      runPhase08SourceIngestionPhaseFn: runPhase08SourceIngestionPhase,
      phase08BatchRows,
      mergePhase08RowsFn: mergePhase08Rows,
      runSourceLlmFieldCandidatePhaseFn: runSourceLlmFieldCandidatePhase,
      enrichFieldCandidatesWithEvidenceRefsFn: enrichFieldCandidatesWithEvidenceRefs,
      extractTemporalSignalsFn: extractTemporalSignals,
      runSourceIdentityCandidateMergePhaseFn: runSourceIdentityCandidateMergePhase,
      runSourceIdentityEvaluationPhaseFn: runSourceIdentityEvaluationPhase,
      buildCandidateFieldMapFn: buildCandidateFieldMap,
      evaluateAnchorConflictsFn: evaluateAnchorConflicts,
      evaluateSourceIdentityFn: evaluateSourceIdentity,
      applyIdentityGateToCandidatesFn: applyIdentityGateToCandidates,
      computeParserHealthFn: computeParserHealth,
      buildSourceArtifactsContextPhaseFn: buildSourceArtifactsContextPhase,
      runSourceFinalizationPhaseFn: runSourceFinalizationPhase,
      sourceResults,
      successfulSourceMetaByUrl,
      frontierDb,
      repairSearchEnabled,
      repairDedupeRule,
      repairQueryByDomain,
      requiredFields,
      buildRepairSearchQueryFn: buildRepairSearchQuery,
      maybeEmitRepairQueryFn: maybeEmitRepairQuery,
      toFloatFn: toFloat,
      artifactsByHost,
      adapterArtifacts,
      collectKnownCandidatesFromSourceFn: collectKnownCandidatesFromSource,
      markSatisfiedLlmFieldsFn: markSatisfiedLlmFields,
      bumpHostOutcomeFn: bumpHostOutcome,
      noteHostRetryTsFn: noteHostRetryTs,
      applyHostBudgetBackoffFn: applyHostBudgetBackoff,
      resolveHostBudgetStateFn: resolveHostBudgetState,
      runSourceResultsAppendPhaseFn: runSourceResultsAppendPhase,
      runSourceEvidenceIndexPhaseFn: runSourceEvidenceIndexPhase,
      runSourcePostFetchStatusPhaseFn: runSourcePostFetchStatusPhase,
      runSourceKnownCandidatesPhaseFn: runSourceKnownCandidatesPhase,
      runSourceConflictTelemetryPhaseFn: runSourceConflictTelemetryPhase,
      runSourceFrontierPersistencePhaseFn: runSourceFrontierPersistencePhase,
      runSourceArtifactAggregationPhaseFn: runSourceArtifactAggregationPhase,
      runSourceHostBudgetPhaseFn: runSourceHostBudgetPhase,
      runSourceProcessedTelemetryPhaseFn: runSourceProcessedTelemetryPhase,
      buildSourceProcessedPayloadFn: buildSourceProcessedPayload,
      traceWriter,
    }),
  });

  const sourceFetchProcessingDispatchContext = buildSourceFetchProcessingDispatchContext({
    ...buildSourceFetchProcessingDispatchPhaseCallsiteContext({
      sourceFetchContext: sourceFetchPhaseContext,
      sourceProcessingContext: sourceProcessingPhaseContext,
      runSourceFetchDispatchPhaseFn: runSourceFetchDispatchPhase,
      runSourceFetchPhaseFn: runSourceFetchPhase,
      runSourceProcessingDispatchPhaseFn: runSourceProcessingDispatchPhase,
      runSourceProcessingPhaseFn: runSourceProcessingPhase,
    }),
  });

  return {
    sourcePreflightDispatchContext,
    sourceFetchProcessingDispatchContext,
    sourceSkipDispatchContext,
    sourceExtractionPhaseContext,
  };
}
