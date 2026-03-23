import { describe, it } from 'node:test';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as barrel from '../src/features/indexing/orchestration/index.js';
import {
  buildAnalysisArtifactKeyContext,
  maybeApplyBlockedDomainCooldown,
  runComponentPriorPhase,
  runDiscoverySeedPlan,
} from '../src/features/indexing/orchestration/index.js';

test('buildAnalysisArtifactKeyContext builds run/latest analysis keys and stamps summary pointers', () => {
  const calls = {
    resolveOutputKey: 0,
  };
  const summary = {
    needset: { existing: true },
    phase07: { existing: true },
    phase08: { existing: true },
  };

  const storage = {
    resolveOutputKey: (...parts) => {
      calls.resolveOutputKey += 1;
      return parts.join('/');
    },
  };

  const result = buildAnalysisArtifactKeyContext({
    storage,
    category: 'mouse',
    productId: 'mouse-product',
    runBase: 'specs/outputs/mouse/mouse-product/runs/run_123',
    summary,
  });

  assert.equal(calls.resolveOutputKey, 1);
  assert.equal(result.latestBase, 'mouse/mouse-product/latest');
  assert.equal(result.needSetRunKey.endsWith('/analysis/needset.json'), true);
  assert.equal(result.needSetLatestKey.endsWith('/latest/needset.json'), true);
  assert.equal(result.phase07RunKey.endsWith('/analysis/phase07_retrieval.json'), true);
  assert.equal(result.phase07LatestKey.endsWith('/latest/phase07_retrieval.json'), true);
  assert.equal(result.phase08RunKey.endsWith('/analysis/phase08_extraction.json'), true);
  assert.equal(result.phase08LatestKey.endsWith('/latest/phase08_extraction.json'), true);
  assert.equal(result.sourcePacketsRunKey.endsWith('/analysis/source_indexing_extraction_packets.json'), true);
  assert.equal(result.sourcePacketsLatestKey.endsWith('/latest/source_indexing_extraction_packets.json'), true);
  assert.equal(result.itemPacketRunKey.endsWith('/analysis/item_indexing_extraction_packet.json'), true);
  assert.equal(result.itemPacketLatestKey.endsWith('/latest/item_indexing_extraction_packet.json'), true);
  assert.equal(result.runMetaPacketRunKey.endsWith('/analysis/run_meta_packet.json'), true);
  assert.equal(result.runMetaPacketLatestKey.endsWith('/latest/run_meta_packet.json'), true);

  assert.equal(summary.needset.existing, true);
  assert.equal(summary.needset.key, result.needSetRunKey);
  assert.equal(summary.needset.latest_key, result.needSetLatestKey);
  assert.equal(summary.phase07.existing, true);
  assert.equal(summary.phase07.key, result.phase07RunKey);
  assert.equal(summary.phase07.latest_key, result.phase07LatestKey);
  assert.equal(summary.phase08.existing, true);
  assert.equal(summary.phase08.key, result.phase08RunKey);
  assert.equal(summary.phase08.latest_key, result.phase08LatestKey);
});

// Step 0 — Characterization test: lock down every named export from the orchestration barrel.
// If a sub-barrel or barrel rewrite drops an export, this test will fail.


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

test('maybeApplyBlockedDomainCooldown ignores non-blocking statuses/messages', () => {
  const hitCount = new Map();
  const applied = new Set();
  let blockCalls = 0;

  const result = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 200,
    message: 'ok',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 2,
    blockedDomainsApplied: applied,
    planner: { blockHost: () => { blockCalls += 1; return 0; } },
    logger: { warn() {} },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  assert.equal(result, false);
  assert.equal(blockCalls, 0);
  assert.equal(hitCount.size, 0);
  assert.equal(applied.size, 0);
});

test('maybeApplyBlockedDomainCooldown applies 403 cooldown only after threshold', () => {
  const hitCount = new Map();
  const applied = new Set();
  const warnCalls = [];
  const plannerCalls = [];

  const first = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 403,
    message: '',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 2,
    blockedDomainsApplied: applied,
    planner: {
      blockHost: (host, reason) => {
        plannerCalls.push({ host, reason });
        return 5;
      }
    },
    logger: { warn: (...args) => warnCalls.push(args) },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  const second = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 403,
    message: '',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 2,
    blockedDomainsApplied: applied,
    planner: {
      blockHost: (host, reason) => {
        plannerCalls.push({ host, reason });
        return 5;
      }
    },
    logger: { warn: (...args) => warnCalls.push(args) },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  assert.equal(first, false);
  assert.equal(second, true);
  assert.equal(hitCount.get('example.com'), 2);
  assert.equal(applied.has('example.com'), true);
  assert.deepEqual(plannerCalls, [{ host: 'example.com', reason: 'status_403_backoff' }]);
  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0][0], 'blocked_domain_cooldown_applied');
  assert.equal(warnCalls[0][1].removed_count, 5);
});

test('maybeApplyBlockedDomainCooldown applies 429 backoff reason and does not reapply once set', () => {
  const hitCount = new Map();
  const applied = new Set();
  const plannerCalls = [];

  const first = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 429,
    message: 'rate limit',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 1,
    blockedDomainsApplied: applied,
    planner: {
      blockHost: (host, reason) => {
        plannerCalls.push({ host, reason });
        return 2;
      }
    },
    logger: { warn() {} },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  const second = maybeApplyBlockedDomainCooldown({
    source: { host: 'example.com', url: 'https://example.com/spec' },
    statusCode: 429,
    message: 'rate limit',
    blockedDomainHitCount: hitCount,
    blockedDomainThreshold: 1,
    blockedDomainsApplied: applied,
    planner: {
      blockHost: (host, reason) => {
        plannerCalls.push({ host, reason });
        return 2;
      }
    },
    logger: { warn() {} },
    normalizeHostTokenFn: (value) => String(value || '').toLowerCase(),
    hostFromHttpUrlFn: () => 'example.com',
  });

  assert.equal(first, true);
  assert.equal(second, false);
  assert.deepEqual(plannerCalls, [{ host: 'example.com', reason: 'status_429_backoff' }]);
});

test('runComponentPriorPhase is a no-op when identity gate is not validated', async () => {
  const result = await runComponentPriorPhase({
    identityGate: { validated: false },
    fieldsBelowPassTarget: ['dpi'],
    criticalFieldsBelowPassTarget: ['dpi'],
    loadComponentLibraryFn: async () => {
      throw new Error('should_not_be_called');
    },
  });

  assert.deepEqual(result.componentPriorFilledFields, []);
  assert.deepEqual(result.componentPriorMatches, []);
  assert.deepEqual(result.fieldsBelowPassTarget, ['dpi']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, ['dpi']);
});

test('runComponentPriorPhase applies component priors and refreshes deficit sets', async () => {
  const result = await runComponentPriorPhase({
    identityGate: { validated: true },
    storage: { marker: 'storage' },
    normalized: { fields: { dpi: null, weight_g: 60 } },
    provenance: { weight_g: { confidence: 0.9 } },
    fieldOrder: ['dpi', 'weight_g'],
    logger: { info() {} },
    fieldsBelowPassTarget: ['dpi', 'weight_g'],
    criticalFieldsBelowPassTarget: ['dpi'],
    loadComponentLibraryFn: async ({ storage }) => {
      assert.equal(storage.marker, 'storage');
      return { rows: [{ id: 1 }] };
    },
    applyComponentLibraryPriorsFn: (payload) => {
      assert.equal(payload.fieldOrder.length, 2);
      assert.equal(payload.library.rows.length, 1);
      assert.equal(typeof payload.logger.info, 'function');
      return {
        filled_fields: ['dpi'],
        matched_components: ['shell_v2'],
      };
    },
  });

  assert.deepEqual(result.componentPriorFilledFields, ['dpi']);
  assert.deepEqual(result.componentPriorMatches, ['shell_v2']);
  assert.deepEqual(result.fieldsBelowPassTarget, ['weight_g']);
  assert.deepEqual(result.criticalFieldsBelowPassTarget, []);
});

function makeStorage() {
  return {
    resolveOutputKey: () => '_learning/test',
    readJsonOrNull: async () => null,
  };
}

function makeStageStubs(overrides = {}) {
  return {
    runNeedSetFn: async () => ({
      schema2: null,
      schema3: null,
      seedSchema4: null,
      searchPlanHandoff: null,
      focusGroups: [],
    }),
    runBrandResolverFn: async () => ({ brandResolution: null, promotedHosts: [] }),
    runSearchProfileFn: () => ({
      searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] },
      effectiveHostPlan: null,
      hostPlanQueryRows: [],
    }),
    runSearchPlannerFn: async () => ({ enhancedRows: [], source: 'deterministic_fallback' }),
    runQueryJourneyFn: async () => ({
      queries: [],
      selectedQueryRowMap: new Map(),
      profileQueryRowsByQuery: new Map(),
      searchProfilePlanned: {},
      searchProfileKeys: {},
      executionQueryLimit: 0,
      queryLimit: 8,
      queryRejectLogCombined: [],
    }),
    executeSearchQueriesFn: async () => ({
      rawResults: [],
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: null,
    }),
    processDiscoveryResultsFn: async () => ({
      enabled: true,
      selectedUrls: ['https://approved.example/spec'],
      allCandidateUrls: ['https://candidate.example/spec'],
      candidates: [],
    }),
    runDomainClassifierFn: () => ({ enqueuedCount: 0, seededCount: 0 }),
    ...overrides,
  };
}

test('runDiscoverySeedPlan builds discovery hints, applies runtime search-disable override, and seeds planner queues', async () => {
  const normalizeCalls = [];
  const plannerApprovedDiscoveryCalls = [];
  const plannerCandidateSeedCalls = [];
  const loadSourceEntryCalls = [];
  const sourceEntries = [{
    sourceId: 'rtings_com',
    host: 'rtings.com',
    discovery: { method: 'search_first', enabled: true, priority: 90 },
  }];

  // Use real domain classifier to test enqueue behavior
  const { runDomainClassifier } = await import('../src/features/indexing/discovery/stages/domainClassifier.js');

  const result = await runDiscoverySeedPlan({
    config: {
      searchEngines: 'serper',
      maxCandidateUrls: 10,
      fetchCandidateSources: true,
      marker: 'cfg',
    },
    runtimeOverrides: {
      disable_search: true,
    },
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g', 'battery_life_hours'],
      schema: {
        critical_fields: ['battery_life_hours'],
      },
    },
    job: { productId: 'mouse-sample' },
    runId: 'run_12345678',
    logger: { info: () => {}, warn: () => {} },
    roundContext: {
      missing_required_fields: ['weight_g'],
      missing_critical_fields: ['battery_life_hours'],
    },
    requiredFields: ['weight_g'],
    llmContext: { marker: 'llm' },
    frontierDb: { marker: 'frontier' },
    traceWriter: { marker: 'trace' },
    learningStoreHints: { marker: 'learning' },
    planner: {
      enqueue(url, discoveredFrom, options) {
        plannerApprovedDiscoveryCalls.push({ url, discoveredFrom, options });
        return true;
      },
      seedCandidates(urls, options) {
        plannerCandidateSeedCalls.push({ urls, options });
      },
      enqueueCounters: { total: 0 },
    },
    normalizeFieldListFn: (fields, options) => {
      normalizeCalls.push({ fields, options });
      return Array.from(fields || []).filter(Boolean);
    },
    loadEnabledSourceEntriesFn: async ({ config, category }) => {
      loadSourceEntryCalls.push({ config, category });
      return sourceEntries;
    },
    ...makeStageStubs({
      runDomainClassifierFn: (args) => runDomainClassifier(args),
    }),
  });

  assert.ok(result.enabled, 'result should be enabled');
  assert.ok(normalizeCalls.length >= 2, 'normalizeFn called at least twice');
  assert.equal(loadSourceEntryCalls.length, 1);
  assert.equal(loadSourceEntryCalls[0].category, 'mouse');
  assert.equal(loadSourceEntryCalls[0].config.marker, 'cfg');

  assert.deepEqual(plannerApprovedDiscoveryCalls, [
    {
      url: 'https://approved.example/spec',
      discoveredFrom: 'discovery_approved',
      options: { forceApproved: true, forceBrandBypass: false, triageMeta: null },
    },
  ]);
  assert.deepEqual(plannerCandidateSeedCalls, [
    {
      urls: ['https://candidate.example/spec'],
      options: { triageMetaMap: plannerCandidateSeedCalls[0]?.options?.triageMetaMap },
    },
  ]);
});

test('runDiscoverySeedPlan skips candidate seeding when fetchCandidateSources is disabled', async () => {
  let plannerCandidateSeeded = false;
  const { runDomainClassifier } = await import('../src/features/indexing/discovery/stages/domainClassifier.js');

  await runDiscoverySeedPlan({
    config: {
      searchEngines: 'serper',
      maxCandidateUrls: 10,
      fetchCandidateSources: false,
    },
    runtimeOverrides: {},
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g'],
      schema: {
        critical_fields: ['battery_life_hours'],
      },
    },
    job: { productId: 'mouse-sample' },
    runId: 'run_87654321',
    logger: { info: () => {}, warn: () => {} },
    roundContext: {
      missing_required_fields: ['weight_g'],
      missing_critical_fields: ['battery_life_hours'],
      extra_queries: [],
    },
    requiredFields: ['weight_g'],
    llmContext: {},
    frontierDb: null,
    traceWriter: null,
    learningStoreHints: null,
    planner: {
      enqueue() {},
      seedCandidates() {
        plannerCandidateSeeded = true;
      },
      enqueueCounters: { total: 0 },
    },
    normalizeFieldListFn: (fields) => Array.from(fields || []).filter(Boolean),
    loadEnabledSourceEntriesFn: async () => [],
    ...makeStageStubs({
      processDiscoveryResultsFn: async () => ({
        enabled: true,
        selectedUrls: [],
        allCandidateUrls: ['https://candidate.example/spec'],
        candidates: [],
      }),
      runDomainClassifierFn: (args) => runDomainClassifier(args),
    }),
  });

  assert.equal(plannerCandidateSeeded, false);
});

test('runDiscoverySeedPlan recovers searchProvider when roundConfigBuilder sets it to none (round 0)', async () => {
  let capturedSearchConfig = null;

  await runDiscoverySeedPlan({
    config: {
      searchEngines: '',
      discoveryEnabled: false,
      maxCandidateUrls: 10,
      fetchCandidateSources: true,
    },
    runtimeOverrides: {},
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g'],
      schema: { critical_fields: [] },
    },
    job: { productId: 'mouse-round0' },
    runId: 'run_round0',
    logger: { info: () => {}, warn: () => {} },
    roundContext: {},
    requiredFields: [],
    llmContext: {},
    frontierDb: null,
    traceWriter: null,
    learningStoreHints: null,
    planner: { enqueue() {}, seedCandidates() {}, enqueueCounters: { total: 0 } },
    normalizeFieldListFn: (fields) => Array.from(fields || []).filter(Boolean),
    loadEnabledSourceEntriesFn: async () => [],
    ...makeStageStubs({
      executeSearchQueriesFn: async (args) => {
        capturedSearchConfig = args.config;
        return {
          rawResults: [],
          searchAttempts: [],
          searchJournal: [],
          internalSatisfied: false,
          externalSearchReason: null,
        };
      },
    }),
  });

  // WHY: discoveryEnabled is a pipeline invariant — always forced true.
  assert.equal(capturedSearchConfig.discoveryEnabled, true);
  // WHY: searchProvider 'none' from round 0 config must be recovered to 'bing,google'.
  assert.equal(capturedSearchConfig.searchEngines, 'bing,google');
});
