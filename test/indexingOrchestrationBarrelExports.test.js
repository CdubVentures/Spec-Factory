import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Step 0 — Characterization test: lock down every named export from the orchestration barrel.
// If a sub-barrel or barrel rewrite drops an export, this test will fail.

import * as barrel from '../src/features/indexing/orchestration/index.js';

// --- bootstrap/ (36 exports) ---
const BOOTSTRAP_EXPORTS = [
  'createRunRuntime',
  'createRuntimeOverridesLoader',
  'createIdentityBootstrapContext',
  'createRunLoggerBootstrap',
  'buildRunBootstrapLogPayload',
  'createRunTraceWriter',
  'createResearchBootstrap',
  'createPlannerBootstrap',
  'createModeAwareFetcherRegistry',
  'filterResumeSeedUrls',
  'runFetchSchedulerDrain',
  'runPlannerQueueSnapshotPhase',
  'buildFetcherStartContext',
  'runFetcherStartPhase',
  'buildRunRuntimePhaseCallsiteContext',
  'buildRunRuntimeContext',
  'buildRuntimeOverridesLoaderPhaseCallsiteContext',
  'buildRuntimeOverridesLoaderContext',
  'buildIdentityBootstrapPhaseCallsiteContext',
  'buildIdentityBootstrapContext',
  'buildRunLoggerBootstrapPhaseCallsiteContext',
  'buildRunLoggerBootstrapContext',
  'buildRunBootstrapLogPayloadPhaseCallsiteContext',
  'buildRunBootstrapLogPayloadContext',
  'buildRunTraceWriterPhaseCallsiteContext',
  'buildRunTraceWriterContext',
  'buildResearchBootstrapPhaseCallsiteContext',
  'buildResearchBootstrapContext',
  'buildPlannerBootstrapPhaseCallsiteContext',
  'buildPlannerBootstrapContext',
  'buildFetchSchedulerDrainPhaseCallsiteContext',
  'buildFetchSchedulerDrainContext',
  'buildFetcherStartPhaseCallsiteContext',
  'createRunLlmRuntime',
  'loadLearningStoreHintsForRun',
  'bootstrapRunEventIndexing',
];

// --- discovery/ (2 exports) ---
const DISCOVERY_EXPORTS = [
  'buildDiscoverySeedPlanContext',
  'runDiscoverySeedPlan',
];

// --- execution/ (62 exports, incl. 1 alias) ---
const EXECUTION_EXPORTS = [
  'buildHypothesisFollowupsContext',
  'runHypothesisFollowups',
  'resolveHypothesisFollowupState',
  'runRepairSearchPhase',
  'runPhase08SourceIngestionPhase',
  'runSourceIdentityCandidateMergePhase',
  'runSourceLlmFieldCandidatePhase',
  'runSourceIdentityEvaluationPhase',
  'buildSourceArtifactsContextPhase',
  'buildSourceProcessedPayload',
  'collectKnownCandidatesFromSource',
  'buildSourceFetchClassificationPhase',
  'maybeEmitRepairQuery',
  'maybeApplyBlockedDomainCooldown',
  'buildSourceSkipBeforeFetchPhaseContext',
  'runSourceSkipBeforeFetchPhase',
  'buildSourceSkipDispatchContext',
  'runSourceSkipDispatchPhase',
  'buildSourcePreflightPhaseContext',
  'buildSourcePreflightDispatchContext',
  'runSourcePreflightPhase',
  'runSourcePreflightDispatchPhase',
  'resolveSourcePreflightDispatchState',
  'buildSourceFetchPhaseContext',
  'runSourceFetchDispatchPhase',
  'buildSourceFetchProcessingDispatchContext',
  'buildSourceQueuePhasePayload',
  'resolveSourceFetchProcessingDispatchState',
  'runSourceFetchProcessingDispatchPhase',
  'runSourceFetchPhase',
  'runSourceArtifactsPhase',
  'runSourceProcessingDispatchPhase',
  'buildSourceProcessingPhaseContext',
  'runSourceProcessingPhase',
  'createPlannerQueueRuntime',
  'buildSourceExtractionPhaseContext',
  'runSourceExtractionDispatchPhase',
  'runSourceExtractionPhase',
  'runSourceFinalizationPhase',
  'runSourceEvidenceIndexPhase',
  'runSourcePostFetchStatusPhase',
  'runSourceKnownCandidatesPhase',
  'runSourceConflictTelemetryPhase',
  'runSourceResultsAppendPhase',
  'runSourceFrontierPersistencePhase',
  'runSourceHostBudgetPhase',
  'runSourceArtifactAggregationPhase',
  'runSourceProcessedTelemetryPhase',
  'buildSourceExtractionPhaseCallsiteContext',
  'buildSourceFetchPhaseCallsiteContext',
  'buildSourceFetchProcessingDispatchPhaseCallsiteContext',
  'buildSourcePreflightDispatchPhaseCallsiteContext',
  'buildSourcePreflightPhaseCallsiteContext',
  'buildSourceProcessingPhaseCallsiteContext',
  'buildSourceSkipBeforeFetchPhaseCallsiteContext',
  'buildSourceSkipDispatchPhaseCallsiteContext',
  'buildProcessPlannerQueueExecutionContexts',
  'createProcessPlannerQueueMutableState',
  'buildProcessPlannerQueuePhaseCallsiteContext',
  'runPlannerQueueDispatchPhase',
  'runProcessPlannerQueuePhase',
  'runPlannerProcessingLifecycle',
];

// --- finalize/ (80 exports) ---
const FINALIZE_EXPORTS = [
  'buildDedicatedSyntheticSourceIngestionContext',
  'runDedicatedSyntheticSourceIngestionPhase',
  'buildIndexingResumePersistenceContext',
  'runIndexingResumePersistencePhase',
  'resolveIndexingResumePersistenceState',
  'createProductFinalizationDerivationRuntime',
  'createProductFinalizationPipelineRuntime',
  'createProductCompletionRuntime',
  'runProductFinalizationDerivation',
  'runProductFinalizationPipeline',
  'runProductCompletionLifecycle',
  'buildIdentityConsensusContext',
  'buildIdentityNormalizationContext',
  'buildValidationGateContext',
  'buildConstraintAnalysisContext',
  'buildRunSummaryPayload',
  'buildNeedsetReasoningContext',
  'buildPhase07PrimeSourcesOptions',
  'buildPhase07PrimeSourcesContext',
  'buildPhase08ExtractionContext',
  'buildFinalizationMetricsContext',
  'applyResearchArtifactsContext',
  'buildAnalysisArtifactKeyContext',
  'persistAnalysisArtifacts',
  'buildFinalizationEventPayloads',
  'buildRunCompletedPayloadContext',
  'buildRunCompletedPayload',
  'buildRunResultPayload',
  'finalizeRunLifecycle',
  'buildLearningExportPhaseContext',
  'buildSelfImproveLearningStoresContext',
  'persistSelfImproveLearningStores',
  'buildLearningGateContext',
  'runLearningGatePhase',
  'buildPostLearningUpdatesContext',
  'runPostLearningUpdatesPhase',
  'buildTerminalLearningExportLifecycleContext',
  'runTerminalLearningExportLifecycle',
  'buildSourceIntelFinalizationContext',
  'runSourceIntelFinalizationPhase',
  'buildIdentityReportPersistenceContext',
  'runIdentityReportPersistencePhase',
  'buildSummaryArtifactsPhaseContext',
  'buildSummaryArtifactsContext',
  'buildFinalizationTelemetryContext',
  'runFinalizationTelemetryPhase',
  'emitFinalizationEvents',
  'emitRunCompletedEvent',
  'resolveIndexingSchemaValidation',
  'buildIndexingSchemaSummaryPayload',
  'buildIndexingSchemaArtifactsPhaseContext',
  'runIndexingSchemaArtifactsPhase',
  'buildAnalysisArtifactKeyPhaseContext',
  'buildConstraintAnalysisPhaseCallsiteContext',
  'buildFinalizationMetricsPhaseCallsiteContext',
  'buildFinalizationTelemetryPhaseCallsiteContext',
  'buildIdentityConsensusPhaseCallsiteContext',
  'buildIdentityNormalizationPhaseCallsiteContext',
  'buildIdentityReportPersistencePhaseCallsiteContext',
  'buildIndexingSchemaArtifactsPhaseCallsiteContext',
  'buildLearningExportPhaseCallsiteContext',
  'buildLearningGatePhaseCallsiteContext',
  'buildNeedsetReasoningPhaseCallsiteContext',
  'buildPhase07PrimeSourcesPhaseCallsiteContext',
  'buildPhase08ExtractionPhaseCallsiteContext',
  'buildPostLearningUpdatesPhaseCallsiteContext',
  'buildResearchArtifactsPhaseContext',
  'buildRunCompletedEventCallsiteContext',
  'buildRunCompletedEventContext',
  'buildRunCompletedPayloadPhaseCallsiteContext',
  'buildRunResultPayloadPhaseCallsiteContext',
  'buildRunResultPayloadContext',
  'buildRunSummaryPayloadPhaseCallsiteContext',
  'buildRunSummaryPayloadContext',
  'buildSelfImproveLearningStoresPhaseCallsiteContext',
  'buildSourceIntelFinalizationPhaseCallsiteContext',
  'buildSummaryArtifactsPhaseCallsiteContext',
  'buildTerminalLearningExportLifecyclePhaseCallsiteContext',
  'buildValidationGatePhaseCallsiteContext',
  'writeSummaryMarkdownLLM',
];

// --- quality/ (6 exports) ---
const QUALITY_EXPORTS = [
  'applyRuntimeGateAndCuration',
  'runComponentPriorPhase',
  'runAggressiveExtractionPhase',
  'runInferencePolicyPhase',
  'runDeterministicCriticPhase',
  'runLlmValidatorPhase',
];

// --- shared/ sample (verify export * works) ---
const SHARED_SAMPLE_EXPORTS = [
  'sha256', 'sha256Buffer', 'stableHash',
  'screenshotMimeType', 'screenshotExtension',
  'isDiscoveryOnlySourceUrl', 'isRobotsTxtUrl', 'isSitemapUrl',
  'hasSitemapXmlSignals', 'isLikelyIndexableEndpointUrl',
  'isHelperSyntheticSource', 'isHelperSyntheticUrl',
  'createEmptyProvenance', 'mergePhase08Rows', 'tsvRowFromFields',
  'buildCandidateFieldMap', 'dedupeCandidates',
  'selectAggressiveEvidencePack', 'buildDomSnippetArtifact',
  'enrichFieldCandidatesWithEvidenceRefs', 'buildTopEvidenceReferences',
  'emitFieldDecisionEvents', 'buildFieldReasoning',
  'toInt', 'toFloat', 'toBool',
  'resolveIdentityAmbiguitySnapshot', 'buildRunIdentityFingerprint',
  'bestIdentityFromSources', 'isIdentityLockedField',
  'loadRouteMatrixPolicyForRun', 'resolveRuntimeControlKey',
  'resolveIndexingResumeKey', 'defaultRuntimeOverrides',
  'normalizeRuntimeOverrides', 'applyRuntimeOverridesToPlanner',
  'enqueueAdapterSeedUrls',
  'resolveScreencastCallback', 'createRunProductFetcherFactory',
  'buildIndexlabRuntimeCategoryConfig',
  'markSatisfiedLlmFields', 'isAnchorLocked',
  'resolveTargets', 'resolveLlmTargetFields',
  'copyContext', 'renameContextKeys',
  'loadEnabledSourceEntries',
];

// --- non-function exports (constants) ---
const CONSTANT_EXPORTS = [
  'METHOD_PRIORITY',
  'PASS_TARGET_EXEMPT_FIELDS',
];

describe('orchestration barrel exports — characterization', () => {
  const allFunctionExports = [
    ...BOOTSTRAP_EXPORTS,
    ...DISCOVERY_EXPORTS,
    ...EXECUTION_EXPORTS,
    ...FINALIZE_EXPORTS,
    ...QUALITY_EXPORTS,
  ];

  it('exports all subdirectory functions', () => {
    for (const name of allFunctionExports) {
      assert.equal(typeof barrel[name], 'function', `barrel.${name} should be a function`);
    }
  });

  it('exports shared helpers via export *', () => {
    for (const name of SHARED_SAMPLE_EXPORTS) {
      assert.notEqual(barrel[name], undefined, `barrel.${name} should be defined (shared)`);
    }
  });

  it('exports constant values', () => {
    for (const name of CONSTANT_EXPORTS) {
      assert.notEqual(barrel[name], undefined, `barrel.${name} should be defined`);
    }
  });

  it('createProcessPlannerQueueMutableState alias exists', () => {
    assert.equal(typeof barrel.createProcessPlannerQueueMutableState, 'function');
  });

  it('getIndexingOrchestrationFeatureInfo returns frozen FEATURE_INFO', () => {
    const info = barrel.getIndexingOrchestrationFeatureInfo();
    assert.deepEqual(info, {
      feature: 'indexing-orchestration',
      phase: 'd1-1-scaffold',
      entrypoint: 'src/features/indexing/orchestration/index.js',
    });
    assert.ok(Object.isFrozen(info), 'FEATURE_INFO should be frozen');
  });

  it('export counts match expected totals', () => {
    assert.equal(BOOTSTRAP_EXPORTS.length, 36, 'bootstrap count');
    assert.equal(DISCOVERY_EXPORTS.length, 2, 'discovery count');
    assert.equal(EXECUTION_EXPORTS.length, 62, 'execution count');
    assert.equal(FINALIZE_EXPORTS.length, 80, 'finalize count');
    assert.equal(QUALITY_EXPORTS.length, 6, 'quality count');
  });
});
