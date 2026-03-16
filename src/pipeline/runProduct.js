import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { buildRunId, normalizeWhitespace, wait } from '../utils/common.js';
import { runWithRetry } from './pipelineSharedHelpers.js';
import { createFetchScheduler } from '../concurrency/fetchScheduler.js';
import { createHostConcurrencyGate, createRequestThrottler } from '../concurrency/requestThrottler.js';
import {
  normalizeHostToken,
  hostFromHttpUrl,
  compactQueryText,
  buildRepairSearchQuery,
  classifyFetchOutcome,
  FETCH_OUTCOME_KEYS,
  createFetchOutcomeCounters,
  createHostBudgetRow,
  ensureHostBudgetRow,
  noteHostRetryTs,
  bumpHostOutcome,
  applyHostBudgetBackoff,
  resolveHostBudgetState
} from './fetchParseWorker.js';
import { loadCategoryConfig } from '../categories/loader.js';
import { SourcePlanner, buildSourceSummary } from '../planner/sourcePlanner.js';
import { PlaywrightFetcher, DryRunFetcher, HttpFetcher, CrawleeFetcher } from '../fetcher/playwrightFetcher.js';
import { selectFetcherMode } from '../fetcher/fetcherMode.js';
import {
  extractCandidatesFromPage,
  buildEvidenceCandidateFingerprint,
  buildEvidencePack,
  extractCandidatesLLM,
  DeterministicParser,
  ComponentResolver,
  retrieveGoldenExamples,
} from '../features/indexing/extraction/index.js';
import {
  evaluateAnchorConflicts,
  mergeAnchorConflictLists,
  buildIdentityReport,
  evaluateSourceIdentity,
  evaluateIdentityGate,
  evaluateValidationGate,
} from '../features/indexing/validation/index.js';
import {
  computeCompletenessRequired,
  computeCoverageOverall,
  computeConfidence
} from '../scoring/qualityScoring.js';
import { runConsensusEngine, applySelectionPolicyReducers } from '../scoring/consensusEngine.js';
import { applyListUnionReducers } from '../scoring/listUnionReducer.js';
import { executeConsensusPhase } from './consensusPhase.js';
import { runLearningExportPhase } from './learningExportPhase.js';
import { evaluateFieldLearningGates, emitLearningGateEvents, populateLearningStores } from './learningGatePhase.js';
import {
  UrlMemoryStore,
  DomainFieldYieldStore,
  FieldAnchorsStore,
  ComponentLexiconStore,
  readLearningHintsFromStores,
  applyLearningSeeds,
  loadLearningProfile,
  persistLearningProfile,
  loadCategoryBrain,
  updateCategoryBrain,
  availabilityClassForField,
  undisclosedThresholdForField,
} from '../features/indexing/learning/index.js';
import { buildIdentityObject, buildAbortedNormalized, buildValidatedNormalized } from '../normalizer/mouseNormalizer.js';
import { exportRunArtifacts } from '../exporter/exporter.js';
import { writeFinalOutputs } from '../exporter/finalExporter.js';
import { buildMarkdownSummary } from '../exporter/summaryWriter.js';
import { EventLogger } from '../logger.js';
import { createAdapterManager } from '../adapters/index.js';
import {
  loadSourceIntel,
  persistSourceIntel
} from '../intel/sourceIntel.js';
import {
  aggregateEndpointSignals,
  mineEndpointSignals
} from '../intel/endpointMiner.js';
import {
  aggregateTemporalSignals,
  extractTemporalSignals
} from '../intel/temporalSignals.js';
import {
  buildSiteFingerprint,
  computeParserHealth
} from '../intel/siteFingerprint.js';
import { evaluateConstraintGraph } from '../scoring/constraintSolver.js';
import { appendCostLedgerEntry, readBillingSnapshot } from '../billing/costLedger.js';
import { recordQueryResult, recordUrlVisit, recordPromptResult } from '../features/indexing/discovery/index.js';
import { captureKnobSnapshot, recordKnobSnapshot } from '../features/indexing/telemetry/index.js';
import { defaultIndexLabRoot } from '../core/config/runtimeArtifactRoots.js';
import { CONFIG_MANIFEST_DEFAULTS } from '../core/config/manifest.js';
import { createBudgetGuard } from '../billing/budgetGuard.js';
import { normalizeCostRates } from '../billing/costRates.js';
import {
  // shared helpers (via orchestration/shared barrel)
  sha256, sha256Buffer, stableHash, screenshotMimeType, screenshotExtension,
  isDiscoveryOnlySourceUrl, isRobotsTxtUrl, isSitemapUrl, hasSitemapXmlSignals,
  isLikelyIndexableEndpointUrl, isSafeManufacturerFollowupUrl,
  isHelperSyntheticUrl, isHelperSyntheticSource,
  createEmptyProvenance, mergePhase08Rows, tsvRowFromFields,
  METHOD_PRIORITY, parseFirstNumber, candidateScore, plausibilityBoost,
  buildCandidateFieldMap, dedupeCandidates,
  selectAggressiveEvidencePack, buildDomSnippetArtifact,
  normalizedSnippetRows, enrichFieldCandidatesWithEvidenceRefs, buildTopEvidenceReferences,
  emitFieldDecisionEvents,
  toInt, toFloat, toBool, isIndexingHelperFlowEnabled,
  resolveIdentityAmbiguitySnapshot, buildRunIdentityFingerprint,
  bestIdentityFromSources, isIdentityLockedField,
  parseMinEvidenceRefs, sendModeIncludesPrime,
  selectPreferredRouteRow, deriveRouteMatrixPolicy,
  loadRouteMatrixPolicyForRun, resolveRuntimeControlKey,
  defaultRuntimeOverrides, normalizeRuntimeOverrides, applyRuntimeOverridesToPlanner,
  buildInitialLlmBudgetState, enqueueAdapterSeedUrls,
  resolveScreencastCallback, createRunProductFetcherFactory,
  buildIndexlabRuntimeCategoryConfig,
  PASS_TARGET_EXEMPT_FIELDS, markSatisfiedLlmFields,
  isAnchorLocked, resolveTargets, resolveLlmTargetFields,
  // bootstrap / execution / finalize
  createRunLlmRuntime,
  bootstrapRunEventIndexing,
  loadLearningStoreHintsForRun,
  runPlannerProcessingLifecycle,
  runProductFinalizationPipeline,
  writeSummaryMarkdownLLM,
  // orchestration phases
  createRunRuntime,
  buildRunRuntimePhaseCallsiteContext,
  buildRunRuntimeContext,
  createRuntimeOverridesLoader,
  buildRuntimeOverridesLoaderPhaseCallsiteContext,
  buildRuntimeOverridesLoaderContext,
  buildIdentityBootstrapPhaseCallsiteContext,
  createIdentityBootstrapContext,
  buildIdentityBootstrapContext,
  createRunLoggerBootstrap,
  buildRunLoggerBootstrapPhaseCallsiteContext,
  buildRunLoggerBootstrapContext,
  buildRunBootstrapLogPayload,
  buildRunBootstrapLogPayloadPhaseCallsiteContext,
  buildRunBootstrapLogPayloadContext,
  createRunTraceWriter,
  buildRunTraceWriterPhaseCallsiteContext,
  buildRunTraceWriterContext,
  createResearchBootstrap,
  buildResearchBootstrapPhaseCallsiteContext,
  buildResearchBootstrapContext,
  createPlannerBootstrap,
  buildPlannerBootstrapPhaseCallsiteContext,
  buildPlannerBootstrapContext,
  createModeAwareFetcherRegistry,
  buildFetchSchedulerDrainPhaseCallsiteContext,
  runFetchSchedulerDrain,
  buildFetchSchedulerDrainContext,
  runPlannerQueueSnapshotPhase,
  buildFetcherStartPhaseCallsiteContext,
  buildFetcherStartContext,
  runFetcherStartPhase,
  buildDiscoverySeedPlanContext,
  runDiscoverySeedPlan,
  buildHypothesisFollowupsContext,
  buildProcessPlannerQueuePhaseCallsiteContext,
  runProcessPlannerQueuePhase,
  runHypothesisFollowups,
  resolveHypothesisFollowupState,
  runRepairSearchPhase,
  runPhase08SourceIngestionPhase,
  runSourceIdentityCandidateMergePhase,
  runSourceLlmFieldCandidatePhase,
  runSourceIdentityEvaluationPhase,
  buildSourceArtifactsContextPhase,
  buildSourceProcessedPayload,
  collectKnownCandidatesFromSource,
  buildSourceFetchClassificationPhase,
  maybeEmitRepairQuery,
  maybeApplyBlockedDomainCooldown,
  buildSourceSkipBeforeFetchPhaseCallsiteContext,
  buildSourceSkipBeforeFetchPhaseContext,
  runSourceSkipBeforeFetchPhase,
  buildSourceSkipDispatchPhaseCallsiteContext,
  buildSourceSkipDispatchContext,
  runSourceSkipDispatchPhase,
  buildSourcePreflightPhaseCallsiteContext,
  buildSourcePreflightPhaseContext,
  buildSourcePreflightDispatchContext,
  buildSourcePreflightDispatchPhaseCallsiteContext,
  runSourcePreflightPhase,
  runSourcePreflightDispatchPhase,
  resolveSourcePreflightDispatchState,
  buildSourceFetchPhaseCallsiteContext,
  buildSourceFetchPhaseContext,
  runSourceFetchDispatchPhase,
  buildSourceFetchProcessingDispatchPhaseCallsiteContext,
  buildSourceFetchProcessingDispatchContext,
  buildSourceQueuePhasePayload,
  resolveSourceFetchProcessingDispatchState,
  runSourceFetchProcessingDispatchPhase,
  runSourceFetchPhase,
  runSourceArtifactsPhase,
  runSourceProcessingDispatchPhase,
  buildSourceProcessingPhaseCallsiteContext,
  buildSourceProcessingPhaseContext,
  runSourceProcessingPhase,
  buildSourceExtractionPhaseCallsiteContext,
  buildSourceExtractionPhaseContext,
  runSourceExtractionDispatchPhase,
  runSourceExtractionPhase,
  runSourceFinalizationPhase,
  runSourceEvidenceIndexPhase,
  runSourcePostFetchStatusPhase,
  runSourceKnownCandidatesPhase,
  runSourceConflictTelemetryPhase,
  runSourceResultsAppendPhase,
  runSourceFrontierPersistencePhase,
  runSourceHostBudgetPhase,
  runSourceArtifactAggregationPhase,
  runSourceProcessedTelemetryPhase,
  buildDedicatedSyntheticSourceIngestionContext,
  runDedicatedSyntheticSourceIngestionPhase,
  buildIndexingResumePersistenceContext,
  runIndexingResumePersistencePhase,
  resolveIndexingResumePersistenceState,
  createProductFinalizationPipelineRuntime,
  applyRuntimeGateAndCuration,
  runComponentPriorPhase,
  runAggressiveExtractionPhase,
  runInferencePolicyPhase,
  runDeterministicCriticPhase,
  runLlmValidatorPhase,
  buildIdentityConsensusPhaseCallsiteContext,
  buildIdentityConsensusContext,
  buildIdentityNormalizationPhaseCallsiteContext,
  buildIdentityNormalizationContext,
  buildValidationGatePhaseCallsiteContext,
  buildValidationGateContext,
  buildConstraintAnalysisPhaseCallsiteContext,
  buildConstraintAnalysisContext,
  buildNeedsetReasoningPhaseCallsiteContext,
  buildRunSummaryPayloadPhaseCallsiteContext,
  buildRunSummaryPayloadContext,
  buildRunSummaryPayload,
  buildNeedsetReasoningContext,
  buildPhase07PrimeSourcesOptions,
  buildPhase07PrimeSourcesPhaseCallsiteContext,
  buildPhase07PrimeSourcesContext,
  buildPhase08ExtractionPhaseCallsiteContext,
  buildPhase08ExtractionContext,
  buildFinalizationMetricsPhaseCallsiteContext,
  buildFinalizationMetricsContext,
  buildCortexSidecarPhaseCallsiteContext,
  buildCortexSidecarContext,
  buildResearchArtifactsPhaseContext,
  applyResearchArtifactsContext,
  buildAnalysisArtifactKeyPhaseContext,
  buildAnalysisArtifactKeyContext,
  persistAnalysisArtifacts,
  buildFinalizationEventPayloads,
  buildRunCompletedPayloadPhaseCallsiteContext,
  buildRunCompletedPayloadContext,
  buildRunCompletedPayload,
  buildRunResultPayloadPhaseCallsiteContext,
  buildRunResultPayloadContext,
  buildRunResultPayload,
  finalizeRunLifecycle,
  buildLearningExportPhaseCallsiteContext,
  buildLearningExportPhaseContext,
  buildSelfImproveLearningStoresPhaseCallsiteContext,
  buildSelfImproveLearningStoresContext,
  persistSelfImproveLearningStores,
  buildLearningGatePhaseCallsiteContext,
  buildLearningGateContext,
  runLearningGatePhase,
  buildPostLearningUpdatesPhaseCallsiteContext,
  buildPostLearningUpdatesContext,
  runPostLearningUpdatesPhase,
  buildTerminalLearningExportLifecyclePhaseCallsiteContext,
  buildTerminalLearningExportLifecycleContext,
  runTerminalLearningExportLifecycle,
  buildSourceIntelFinalizationPhaseCallsiteContext,
  buildSourceIntelFinalizationContext,
  runSourceIntelFinalizationPhase,
  buildIdentityReportPersistencePhaseCallsiteContext,
  buildIdentityReportPersistenceContext,
  runIdentityReportPersistencePhase,
  buildSummaryArtifactsPhaseCallsiteContext,
  buildSummaryArtifactsPhaseContext,
  buildSummaryArtifactsContext,
  buildFinalizationTelemetryPhaseCallsiteContext,
  buildFinalizationTelemetryContext,
  runFinalizationTelemetryPhase,
  emitFinalizationEvents,
  buildRunCompletedEventCallsiteContext,
  buildRunCompletedEventContext,
  emitRunCompletedEvent,
  resolveIndexingSchemaValidation,
  buildIndexingSchemaSummaryPayload,
  buildIndexingSchemaArtifactsPhaseCallsiteContext,
  buildIndexingSchemaArtifactsPhaseContext,
  runIndexingSchemaArtifactsPhase
} from '../features/indexing/orchestration/index.js';
import { updateComponentLibrary } from '../components/library.js';
import { normalizeFieldList, toRawFieldKey } from '../utils/fieldKeys.js';
import { createFieldRulesEngine } from '../engine/fieldRulesEngine.js';
import {
  writeCategoryReviewArtifacts,
  writeProductReviewArtifacts
} from '../review/reviewGridData.js';
import { createFrontier } from '../research/frontierDb.js';
import { RuntimeTraceWriter } from '../runtime/runtimeTraceWriter.js';
import { computeNeedSet } from '../indexlab/needsetEngine.js';
import { buildIndexingSchemaPackets } from '../indexlab/indexingSchemaPackets.js';
import { validateIndexingSchemaPackets } from '../indexlab/indexingSchemaPacketsValidator.js';
import { applyIdentityGateToCandidates } from './identityGateExtraction.js';
import { initializeIndexingResume } from './seams/initializeIndexingResume.js';
import { bootstrapRunProductExecutionState } from './seams/bootstrapRunProductExecutionState.js';
import { buildRunProductPlannerProcessingContext } from './seams/buildRunProductPlannerProcessingContext.js';
import { buildRunProductFinalizationContext } from './seams/buildRunProductFinalizationContext.js';
import {
  normalizeHttpUrlList,
  shouldQueueLlmRetry,
  buildNextLlmRetryRows,
  collectPlannerPendingUrls,
  buildNextSuccessRows
} from '../runtime/indexingResume.js';
import { UberAggressiveOrchestrator } from '../research/uberAggressiveOrchestrator.js';
import { applyInferencePolicies } from '../inference/inferField.js';
import {
  normalizeAmbiguityLevel,
  resolveIdentityLockStatus
} from '../utils/identityNormalize.js';

const RUN_DEDUPE_MODE = 'serp_url+content_hash';

export async function runProduct({
  storage,
  config,
  s3Key,
  jobOverride = null,
  roundContext = null,
  runIdOverride = '',
}) {
  const { runId, runtimeMode } = createRunRuntime({
    ...buildRunRuntimeContext({
      ...buildRunRuntimePhaseCallsiteContext({
        runIdOverride,
        roundContext,
        config,
        buildRunId,
      }),
    }),
  });
  const { logger, startMs } = createRunLoggerBootstrap({
    ...buildRunLoggerBootstrapContext({
      ...buildRunLoggerBootstrapPhaseCallsiteContext({
        storage,
        config,
        runId,
        createEventLogger: (options) => new EventLogger(options),
      }),
    }),
  });

  const job = jobOverride || (await storage.readJson(s3Key));
  const productId = job.productId;
  const category = job.category || 'mouse';
  const runArtifactsBase = storage.resolveOutputKey(category, productId, 'runs', runId);
  const { identityLock, identityFingerprint, identityLockStatus } = await createIdentityBootstrapContext({
    ...buildIdentityBootstrapContext({
      ...buildIdentityBootstrapPhaseCallsiteContext({
        job,
        config,
        category,
        productId,
        resolveIdentityAmbiguitySnapshot: resolveIdentityAmbiguitySnapshot,
        normalizeAmbiguityLevel,
        buildRunIdentityFingerprint,
        resolveIdentityLockStatus,
      }),
    }),
  });
  const {
    runStartedPayload,
    loggerContext,
    runContextPayload,
  } = buildRunBootstrapLogPayload({
    ...buildRunBootstrapLogPayloadContext({
      ...buildRunBootstrapLogPayloadPhaseCallsiteContext({
        s3Key,
        runId,
        roundContext,
        category,
        productId,
        config,
        runtimeMode,
        identityFingerprint,
        identityLockStatus,
        identityLock,
        dedupeMode: RUN_DEDUPE_MODE,
      }),
    }),
  });
  logger.info('run_started', runStartedPayload);
  logger.setContext(loggerContext);
  logger.info('run_context', runContextPayload);

  bootstrapRunEventIndexing({
    logger,
    category,
    productId,
    runId,
    env: process.env,
    manifestDefaults: CONFIG_MANIFEST_DEFAULTS,
    defaultIndexLabRootFn: defaultIndexLabRoot,
    joinPathFn: path.join,
    mkdirSyncFn: fs.mkdirSync,
    captureKnobSnapshotFn: captureKnobSnapshot,
    recordKnobSnapshotFn: recordKnobSnapshot,
    recordUrlVisitFn: recordUrlVisit,
    recordQueryResultFn: recordQueryResult,
  });

  const traceWriter = createRunTraceWriter({
    ...buildRunTraceWriterContext({
      ...buildRunTraceWriterPhaseCallsiteContext({
        storage,
        config,
        runId,
        productId,
        toBool,
        createRuntimeTraceWriter: (options) => new RuntimeTraceWriter(options),
      }),
    }),
  });
  const runtimeOverridesLoader = createRuntimeOverridesLoader({
    ...buildRuntimeOverridesLoaderContext({
      ...buildRuntimeOverridesLoaderPhaseCallsiteContext({
        storage,
        config,
        resolveRuntimeControlKey,
        defaultRuntimeOverrides,
        normalizeRuntimeOverrides,
      }),
    }),
  });
  const runtimeControlKey = runtimeOverridesLoader.runtimeControlKey;
  let runtimeOverrides = runtimeOverridesLoader.getRuntimeOverrides();
  const syncRuntimeOverrides = async ({ force = false } = {}) => {
    runtimeOverrides = await runtimeOverridesLoader.loadRuntimeOverrides({ force });
    return runtimeOverrides;
  };

  const { frontierDb, uberOrchestrator } = await createResearchBootstrap({
    ...buildResearchBootstrapContext({
      ...buildResearchBootstrapPhaseCallsiteContext({
        storage,
        config,
        logger,
        createFrontier,
        createUberAggressiveOrchestrator: (options) => new UberAggressiveOrchestrator(options),
      }),
    }),
  });
  const executionBootstrapState = await bootstrapRunProductExecutionState({
    storage,
    config,
    logger,
    category,
    productId,
    runId,
    roundContext,
    runtimeMode,
    job,
    identityLock,
    identityLockStatus,
    runArtifactsBase,
    traceWriter,
    syncRuntimeOverrides,
    frontierDb,
  });
  runtimeOverrides = executionBootstrapState.runtimeOverrides;
  const {
    previousFinalSpec,
    runtimeFieldRulesEngine,
    fieldOrder,
    requiredFields,
    focus_fields,
    goldenExamples,
    targets,
    helperContext,
    learnedConstraints,
    learnedFieldYield,
    learnedFieldAvailability,
    adapterManager,
    sourceIntel,
    planner,
    indexingResumeKey,
    resumeMode,
    resumeMaxAgeHours,
    previousResumeStateAgeHours,
    resumeReextractEnabled,
    resumeReextractAfterHours,
    resumePersistLimit,
    resumeRetryPersistLimit,
    previousResumePendingUnseeded,
    previousResumeRetryRows,
    previousResumeSuccessRows,
    resumeCooldownSkippedUrls,
    resumeFetchFailedUrls,
    resumeSeededPendingCount,
    resumeSeededLlmRetryCount,
    resumeSeededReextractCount,
    learningProfile,
    fetchHostConcurrencyGate,
    fetcherMode,
    fetcherStartFallbackReason,
    sourceResults,
    attemptedSourceUrls,
    llmRetryReasonByUrl,
    successfulSourceMetaByUrl,
    repairQueryByDomain,
    blockedDomainHitCount,
    blockedDomainsApplied,
    hostBudgetByHost,
    blockedDomainThreshold,
    repairSearchEnabled,
    repairDedupeRule,
    llmSatisfiedFields,
    helperSupportiveSyntheticSources,
    artifactsByHost,
    llmValidatorDecisions,
    llmBudgetGuard,
    llmRuntime,
    llmContext,
    phase08BatchRows,
    discoveryResult,
  } = executionBootstrapState;
  let {
    artifactSequence,
    adapterArtifacts,
    helperFilledFields,
    helperFilledByMethod,
    helperMismatches,
    llmCandidatesAccepted,
    llmSourcesUsed,
    hypothesisFollowupRoundsExecuted,
    hypothesisFollowupSeededUrls,
    phase08FieldContexts,
    phase08PrimeRows,
  } = executionBootstrapState;
  let resumePersistedPendingCount = 0;
  let resumePersistedLlmRetryCount = 0;
  let resumePersistedSuccessCount = 0;

  const plannerProcessingState = await runPlannerProcessingLifecycle(
    buildRunProductPlannerProcessingContext({
      bootstrapState: {
        ...executionBootstrapState,
        startMs,
        runtimeControlKey,
        syncRuntimeOverrides,
      },
      config,
      getRuntimeOverridesFn: () => runtimeOverrides,
    }),
  );
  artifactSequence = plannerProcessingState.artifactSequence;
  phase08FieldContexts = plannerProcessingState.phase08FieldContexts;
  phase08PrimeRows = plannerProcessingState.phase08PrimeRows;
  llmSourcesUsed = plannerProcessingState.llmSourcesUsed;
  llmCandidatesAccepted = plannerProcessingState.llmCandidatesAccepted;
  const terminalReason = plannerProcessingState.terminalReason;
  hypothesisFollowupRoundsExecuted = plannerProcessingState.hypothesisFollowupRoundsExecuted;
  hypothesisFollowupSeededUrls = plannerProcessingState.hypothesisFollowupSeededUrls;

  const resumePersistenceResult = await runIndexingResumePersistencePhase({
    ...buildIndexingResumePersistenceContext({
      storage,
      logger,
      indexingResumeKey,
      category,
      productId,
      runId,
      planner,
      resumeCooldownSkippedUrls,
      resumeFetchFailedUrls,
      previousResumePendingUnseeded,
      resumePersistLimit,
      previousResumeRetryRows,
      llmRetryReasonByUrl,
      attemptedSourceUrls,
      resumeRetryPersistLimit,
      previousResumeSuccessRows,
      successfulSourceMetaByUrl,
      resumeSeededPendingCount,
      resumeSeededLlmRetryCount,
      resumeSeededReextractCount,
      indexingResumeSuccessPersistLimit: config.indexingResumeSuccessPersistLimit,
      toInt,
      normalizeHttpUrlList,
      collectPlannerPendingUrls,
      buildNextLlmRetryRows,
      buildNextSuccessRows,
    }),
  });
  const indexingResumePersistenceState = resolveIndexingResumePersistenceState({
    resumePersistenceResult,
  });
  resumePersistedPendingCount = indexingResumePersistenceState.resumePersistedPendingCount;
  resumePersistedLlmRetryCount = indexingResumePersistenceState.resumePersistedLlmRetryCount;
  resumePersistedSuccessCount = indexingResumePersistenceState.resumePersistedSuccessCount;

  const finalizationPipelineRuntime = createProductFinalizationPipelineRuntime({
    context: buildRunProductFinalizationContext({
      bootstrapState: {
        ...executionBootstrapState,
        dedupeMode: RUN_DEDUPE_MODE,
      },
      terminalReason,
      roundContext,
      startMs,
      runtimeMode,
      identityLock,
      identityFingerprint,
      identityLockStatus,
      helperFilledFields,
      helperFilledByMethod,
      helperMismatches,
      hypothesisFollowupRoundsExecuted,
      hypothesisFollowupSeededUrls,
      resumePersistedPendingCount,
      resumePersistedLlmRetryCount,
      resumePersistedSuccessCount,
      frontierDb,
      uberOrchestrator,
    }),
  });

  return await runProductFinalizationPipeline({
    finalizationPipelineRuntime,
  });
}


