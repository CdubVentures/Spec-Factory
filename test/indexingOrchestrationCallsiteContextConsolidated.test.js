import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConstraintAnalysisPhaseCallsiteContext,
  buildFetchSchedulerDrainPhaseCallsiteContext,
  buildFetcherStartPhaseCallsiteContext,
  buildFinalizationMetricsPhaseCallsiteContext,
  buildFinalizationTelemetryPhaseCallsiteContext,
  buildIdentityBootstrapPhaseCallsiteContext,
  buildIdentityConsensusPhaseCallsiteContext,
  buildIdentityNormalizationPhaseCallsiteContext,
  buildIdentityReportPersistencePhaseCallsiteContext,
  buildLearningGatePhaseCallsiteContext,
  buildPlannerBootstrapPhaseCallsiteContext,
  buildPostLearningUpdatesPhaseCallsiteContext,
  buildProcessPlannerQueuePhaseCallsiteContext,
  buildResearchBootstrapPhaseCallsiteContext,
  buildRunBootstrapLogPayloadPhaseCallsiteContext,
  buildRunCompletedEventCallsiteContext,
  buildRunCompletedPayloadPhaseCallsiteContext,
  buildRunLoggerBootstrapPhaseCallsiteContext,
  buildRunResultPayloadPhaseCallsiteContext,
  buildRunRuntimePhaseCallsiteContext,
  buildRunSummaryPayloadPhaseCallsiteContext,
  buildRunTraceWriterPhaseCallsiteContext,
  buildRuntimeOverridesLoaderPhaseCallsiteContext,
  buildSourceIntelFinalizationPhaseCallsiteContext,
  buildSummaryArtifactsPhaseCallsiteContext,
  buildTerminalLearningExportLifecyclePhaseCallsiteContext,
  buildValidationGatePhaseCallsiteContext,
} from '../src/features/indexing/orchestration/index.js';

test('buildConstraintAnalysisPhaseCallsiteContext maps runProduct constraint-analysis callsite inputs to context keys', () => {
  const aggregateEndpointSignalsFn = () => ({ endpoint_count: 1 });
  const evaluateConstraintGraphFn = () => ({ violations: [] });
  const context = buildConstraintAnalysisPhaseCallsiteContext({
    sourceResults: [{ role: 'manufacturer' }],
    runtimeGateResult: { failures: [] },
    normalized: { fields: { dpi: 240 } },
    provenance: { dpi: { source: 'a' } },
    categoryConfig: { criticalFieldSet: new Set(['dpi']) },
    aggregateEndpointSignalsFn,
    evaluateConstraintGraphFn,
  });
  assert.deepEqual(context.sourceResults, [{ role: 'manufacturer' }]);
  assert.deepEqual(context.runtimeGateResult, { failures: [] });
  assert.deepEqual(context.normalized, { fields: { dpi: 240 } });
  assert.deepEqual(context.provenance, { dpi: { source: 'a' } });
  assert.equal(context.aggregateEndpointSignalsFn, aggregateEndpointSignalsFn);
  assert.equal(context.evaluateConstraintGraphFn, evaluateConstraintGraphFn);
});

test('buildFetchSchedulerDrainPhaseCallsiteContext maps runProduct fetch-scheduler callsite inputs to context keys', () => {
  const planner = { hasNext: () => false };
  const config = {};
  const prepareNextPlannerSource = async () => ({ mode: 'stop' });
  const fetchFn = async () => ({ ok: true });
  const fetchWithModeFn = async () => ({ ok: true });
  const shouldSkipPreflight = () => false;
  const shouldStopScheduler = () => false;
  const classifyOutcomeFn = () => 'fetch_error';
  const handleSchedulerFetchError = () => {};
  const handleSchedulerSkipped = () => {};
  const emitSchedulerEvent = () => {};
  const createFetchScheduler = () => ({ drainQueue: async () => {} });
  const result = buildFetchSchedulerDrainPhaseCallsiteContext({
    planner,
    config,
    prepareNextPlannerSource,
    fetchFn,
    fetchWithModeFn,
    shouldSkipPreflight,
    shouldStopScheduler,
    classifyOutcomeFn,
    handleSchedulerFetchError,
    handleSchedulerSkipped,
    emitSchedulerEvent,
    createFetchScheduler,
  });
  assert.equal(result.planner, planner);
  assert.equal(result.config, config);
  assert.equal(result.prepareNextPlannerSource, prepareNextPlannerSource);
  assert.equal(result.fetchFn, fetchFn);
  assert.equal(result.fetchWithModeFn, fetchWithModeFn);
  assert.equal(result.shouldSkipPreflight, shouldSkipPreflight);
  assert.equal(result.shouldStopScheduler, shouldStopScheduler);
  assert.equal(result.classifyOutcomeFn, classifyOutcomeFn);
  assert.equal(result.handleSchedulerFetchError, handleSchedulerFetchError);
  assert.equal(result.handleSchedulerSkipped, handleSchedulerSkipped);
  assert.equal(result.emitSchedulerEvent, emitSchedulerEvent);
  assert.equal(result.createFetchScheduler, createFetchScheduler);
});

test('buildFetcherStartPhaseCallsiteContext maps runProduct fetcher-start callsite inputs to context keys', () => {
  class FakeHttpFetcher {}
  const fetcher = { id: 'fetcher' };
  const fetcherMode = 'playwright';
  const config = { dryRun: false };
  const logger = { info() {} };
  const fetcherConfig = { concurrency: 4 };
  const result = buildFetcherStartPhaseCallsiteContext({
    fetcher,
    fetcherMode,
    config,
    logger,
    fetcherConfig,
    HttpFetcherClass: FakeHttpFetcher,
  });
  assert.equal(result.fetcher, fetcher);
  assert.equal(result.fetcherMode, fetcherMode);
  assert.equal(result.config, config);
  assert.equal(result.logger, logger);
  assert.equal(result.fetcherConfig, fetcherConfig);
  assert.equal(result.HttpFetcherClass, FakeHttpFetcher);
});

test('buildFinalizationMetricsPhaseCallsiteContext maps runProduct finalization-metrics callsite inputs to context keys', () => {
  const context = buildFinalizationMetricsPhaseCallsiteContext({
    sourceResults: [{ parserHealth: { health_score: 1 } }],
    fieldOrder: ['weight_g'],
    normalized: { fields: { weight_g: 54 } },
    provenance: { weight_g: { source: 'example' } },
  });
  assert.deepEqual(context.sourceResults, [{ parserHealth: { health_score: 1 } }]);
  assert.deepEqual(context.fieldOrder, ['weight_g']);
  assert.deepEqual(context.normalized, { fields: { weight_g: 54 } });
  assert.deepEqual(context.provenance, { weight_g: { source: 'example' } });
});

test('buildFinalizationTelemetryPhaseCallsiteContext maps runProduct finalization telemetry inputs to context keys', () => {
  const context = buildFinalizationTelemetryPhaseCallsiteContext({
    logger: { info() {} },
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    needSet: { needset_size: 3 },
    needSetRunKey: 'needset/run.json',
    phase07PrimeSources: { summary: { fields_attempted: 1 } },
    phase07RunKey: 'phase07/run.json',
    phase08Extraction: { summary: { batch_count: 2 } },
    phase08RunKey: 'phase08/run.json',
    indexingSchemaPackets: { sourceCollection: { source_packet_count: 5 } },
    sourcePacketsRunKey: 'schema/source/run.json',
    itemPacketRunKey: 'schema/item/run.json',
    runMetaPacketRunKey: 'schema/meta/run.json',
    buildFinalizationEventPayloads: () => ({}),
    emitFinalizationEvents: () => {},
  });
  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.category, 'mouse');
  assert.equal(context.needSetRunKey, 'needset/run.json');
  assert.equal(context.phase07RunKey, 'phase07/run.json');
  assert.equal(context.phase08RunKey, 'phase08/run.json');
  assert.equal(context.sourcePacketsRunKey, 'schema/source/run.json');
  assert.equal(context.itemPacketRunKey, 'schema/item/run.json');
  assert.equal(context.runMetaPacketRunKey, 'schema/meta/run.json');
  assert.equal(typeof context.buildFinalizationEventPayloads, 'function');
  assert.equal(typeof context.emitFinalizationEvents, 'function');
});

test('buildIdentityBootstrapPhaseCallsiteContext maps runProduct identity-bootstrap callsite inputs to context keys', () => {
  const job = { identityLock: { brand: 'Logitech' } };
  const config = { profile: 'test' };
  const resolveIdentityAmbiguitySnapshot = async () => ({ family_model_count: 1 });
  const normalizeAmbiguityLevel = () => 'low';
  const buildRunIdentityFingerprint = () => 'idfp';
  const resolveIdentityLockStatus = () => 'locked';
  const result = buildIdentityBootstrapPhaseCallsiteContext({
    job,
    config,
    category: 'mouse',
    productId: 'mouse-sample',
    resolveIdentityAmbiguitySnapshot,
    normalizeAmbiguityLevel,
    buildRunIdentityFingerprint,
    resolveIdentityLockStatus,
  });
  assert.equal(result.job, job);
  assert.equal(result.config, config);
  assert.equal(result.category, 'mouse');
  assert.equal(result.productId, 'mouse-sample');
  assert.equal(result.resolveIdentityAmbiguitySnapshot, resolveIdentityAmbiguitySnapshot);
  assert.equal(result.normalizeAmbiguityLevel, normalizeAmbiguityLevel);
  assert.equal(result.buildRunIdentityFingerprint, buildRunIdentityFingerprint);
  assert.equal(result.resolveIdentityLockStatus, resolveIdentityLockStatus);
});

test('buildIdentityConsensusPhaseCallsiteContext maps runProduct identity-consensus callsite inputs to context keys', () => {
  const evaluateIdentityGateFn = () => ({ validated: true });
  const buildIdentityReportFn = () => ({ status: 'ok' });
  const context = buildIdentityConsensusPhaseCallsiteContext({
    sourceResults: [{ url: 'https://example.com' }],
    productId: 'mouse-1',
    runId: 'run-1',
    job: { identityLock: {} },
    categoryConfig: { id: 'mouse-config' },
    fieldOrder: ['shape'],
    anchors: { shape: 'symmetrical' },
    category: 'mouse',
    config: { strict: true },
    runtimeFieldRulesEngine: { id: 'engine' },
    evaluateIdentityGateFn,
    buildIdentityReportFn,
    bestIdentityFromSourcesFn: () => ({}),
    buildIdentityObjectFn: () => ({}),
    buildSourceSummaryFn: () => ({}),
    mergeAnchorConflictListsFn: () => [],
    executeConsensusPhaseFn: () => ({}),
  });
  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.deepEqual(context.fieldOrder, ['shape']);
  assert.equal(context.evaluateIdentityGateFn, evaluateIdentityGateFn);
  assert.equal(context.buildIdentityReportFn, buildIdentityReportFn);
});

test('buildIdentityNormalizationPhaseCallsiteContext maps runProduct identity-normalization callsite inputs to context keys', () => {
  const buildAbortedNormalizedFn = () => ({ fields: {}, quality: {} });
  const buildValidatedNormalizedFn = () => ({ fields: {}, quality: {} });
  const createEmptyProvenanceFn = () => ({});
  const context = buildIdentityNormalizationPhaseCallsiteContext({
    config: {},
    identityConfidence: 0.8,
    allowHelperProvisionalFill: true,
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    identity: { brand: 'Logitech' },
    sourceSummary: { source_count: 1 },
    fieldOrder: ['shape'],
    consensus: { fields: { shape: 'symmetrical' } },
    categoryConfig: { criticalFieldSet: new Set(['shape']) },
    buildAbortedNormalizedFn,
    buildValidatedNormalizedFn,
    createEmptyProvenanceFn,
    passTargetExemptFields: new Set(['id']),
  });
  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.allowHelperProvisionalFill, true);
  assert.equal(context.buildAbortedNormalizedFn, buildAbortedNormalizedFn);
  assert.equal(context.buildValidatedNormalizedFn, buildValidatedNormalizedFn);
  assert.equal(context.createEmptyProvenanceFn, createEmptyProvenanceFn);
});

test('buildIdentityReportPersistencePhaseCallsiteContext maps runProduct identity-report persistence callsite inputs to context keys', () => {
  const storage = { id: 'storage' };
  const summary = { validated: true };
  const identityReport = { score: 0.92 };
  const context = buildIdentityReportPersistencePhaseCallsiteContext({
    storage,
    runBase: 'runs/r1',
    summary,
    identityReport,
  });
  assert.equal(context.storage, storage);
  assert.equal(context.runBase, 'runs/r1');
  assert.equal(context.summary, summary);
  assert.equal(context.identityReport, identityReport);
});

test('buildLearningGatePhaseCallsiteContext maps runProduct learning-gate callsite inputs to context keys', () => {
  const context = buildLearningGatePhaseCallsiteContext({
    fieldOrder: ['dpi'],
    fields: { dpi: '32000' },
    provenance: { dpi: [] },
    category: 'mouse',
    runId: 'run-1',
    runtimeFieldRulesEngine: { id: 'rules' },
    config: { selfImproveEnabled: true },
    logger: { info() {} },
    evaluateFieldLearningGates: () => ({}),
    emitLearningGateEvents: () => {},
  });
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.fields, { dpi: '32000' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(typeof context.evaluateFieldLearningGates, 'function');
  assert.equal(typeof context.emitLearningGateEvents, 'function');
});

test('buildPlannerBootstrapPhaseCallsiteContext maps runProduct planner-bootstrap callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { marker: 'config' };
  const logger = { marker: 'logger' };
  const category = 'mouse';
  const job = { productId: 'mouse-1' };
  const categoryConfig = { fieldOrder: ['dpi'] };
  const requiredFields = ['dpi'];
  const createAdapterManager = () => ({ id: 'adapter-manager' });
  const loadSourceIntel = async () => ({ rows: [] });
  const createSourcePlanner = (...args) => ({ args });
  const syncRuntimeOverrides = async () => ({});
  const applyRuntimeOverridesToPlanner = () => {};
  const result = buildPlannerBootstrapPhaseCallsiteContext({
    storage,
    config,
    logger,
    category,
    job,
    categoryConfig,
    requiredFields,
    createAdapterManager,
    loadSourceIntel,
    createSourcePlanner,
    syncRuntimeOverrides,
    applyRuntimeOverridesToPlanner,
  });
  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.logger, logger);
  assert.equal(result.category, category);
  assert.equal(result.job, job);
  assert.equal(result.categoryConfig, categoryConfig);
  assert.equal(result.requiredFields, requiredFields);
  assert.equal(result.createAdapterManager, createAdapterManager);
  assert.equal(result.loadSourceIntel, loadSourceIntel);
  assert.equal(result.createSourcePlanner, createSourcePlanner);
  assert.equal(result.syncRuntimeOverrides, syncRuntimeOverrides);
  assert.equal(result.applyRuntimeOverridesToPlanner, applyRuntimeOverridesToPlanner);
});

test('buildPostLearningUpdatesPhaseCallsiteContext maps runProduct post-learning callsite inputs to context keys', () => {
  const context = buildPostLearningUpdatesPhaseCallsiteContext({
    storage: { id: 'storage' },
    config: { selfImproveEnabled: true },
    category: 'mouse',
    job: { id: 'job-1' },
    normalized: { fields: { dpi: '32000' } },
    summary: { confidence: 0.9 },
    provenance: { dpi: [{ source: 'https://example.com' }] },
    sourceResults: [{ url: 'https://example.com' }],
    discoveryResult: { selected_sources: [] },
    runId: 'run-1',
    updateCategoryBrain: async () => ({}),
    updateComponentLibrary: async () => ({}),
  });
  assert.equal(context.storage.id, 'storage');
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(typeof context.updateCategoryBrain, 'function');
  assert.equal(typeof context.updateComponentLibrary, 'function');
});

test('buildProcessPlannerQueuePhaseCallsiteContext maps runProduct process-planner-queue callsite inputs to context keys', () => {
  const maybeApplyBlockedDomainCooldown = () => {};
  const planner = { hasNext: () => false };
  const logger = { info() {}, warn() {}, error() {} };
  const config = { maxRunSeconds: 60 };
  const createFetchScheduler = () => ({ drainQueue: async () => {} });
  const result = buildProcessPlannerQueuePhaseCallsiteContext({
    maybeApplyBlockedDomainCooldown,
    planner,
    logger,
    config,
    createFetchScheduler,
  });
  assert.equal(typeof result.runPlannerQueueDispatchPhaseFn, 'function');
  assert.equal(typeof result.plannerQueueRuntime?.buildPlannerQueueDispatchInput, 'function');
  assert.equal(Object.hasOwn(result, 'context'), false);
  const dispatchInput = result.plannerQueueRuntime.buildPlannerQueueDispatchInput({
    state: {
      runtimePauseAnnounced: true,
      fetchWorkerSeq: 2,
      artifactSequence: 5,
      runtimeOverrides: { blocked_domains: ['runtime.example.com'] },
    },
  });
  assert.equal(dispatchInput.planner, planner);
  assert.equal(dispatchInput.logger, logger);
  assert.equal(dispatchInput.config, config);
  assert.equal(dispatchInput.createFetchScheduler, createFetchScheduler);
  assert.equal(dispatchInput.runtimePauseAnnounced, true);
  assert.equal(dispatchInput.fetchWorkerSeq, 2);
  assert.equal(dispatchInput.artifactSequence, 5);
});

test('buildResearchBootstrapPhaseCallsiteContext maps runProduct research-bootstrap callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = {};
  const logger = { marker: 'logger' };
  const createFrontier = () => ({ load: async () => {} });
  const createUberAggressiveOrchestrator = (options) => ({ options });
  const result = buildResearchBootstrapPhaseCallsiteContext({
    storage,
    config,
    logger,
    createFrontier,
    createUberAggressiveOrchestrator,
  });
  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.logger, logger);
  assert.equal(result.createFrontier, createFrontier);
  assert.equal(result.createUberAggressiveOrchestrator, createUberAggressiveOrchestrator);
});

test('buildRunBootstrapLogPayloadPhaseCallsiteContext maps runProduct bootstrap-log callsite inputs to context keys', () => {
  const config = { runProfile: 'thorough' };
  const roundContext = { round: 1 };
  const identityLock = { family_model_count: 2 };
  const result = buildRunBootstrapLogPayloadPhaseCallsiteContext({
    s3Key: 'specs/inputs/mouse/products/sample.json',
    runId: 'run.abc123',
    roundContext,
    category: 'mouse',
    productId: 'mouse-sample',
    config,
    runtimeMode: 'balanced',
    identityFingerprint: 'idfp',
    identityLockStatus: 'locked',
    identityLock,
    dedupeMode: 'serp_url+content_hash',
  });
  assert.equal(result.s3Key, 'specs/inputs/mouse/products/sample.json');
  assert.equal(result.runId, 'run.abc123');
  assert.equal(result.roundContext, roundContext);
  assert.equal(result.category, 'mouse');
  assert.equal(result.productId, 'mouse-sample');
  assert.equal(result.config, config);
  assert.equal(result.runtimeMode, 'balanced');
  assert.equal(result.identityFingerprint, 'idfp');
  assert.equal(result.identityLockStatus, 'locked');
  assert.equal(result.identityLock, identityLock);
  assert.equal(result.dedupeMode, 'serp_url+content_hash');
});

test('buildRunCompletedEventCallsiteContext maps runProduct run_completed emission callsite inputs to context keys', () => {
  const logger = { info() {} };
  const runCompletedPayload = { runId: 'run-1', productId: 'mouse-1' };
  const context = buildRunCompletedEventCallsiteContext({
    logger,
    runCompletedPayload,
  });
  assert.equal(context.logger, logger);
  assert.equal(context.runCompletedPayload, runCompletedPayload);
});

test('buildRunCompletedPayloadPhaseCallsiteContext maps runProduct run-completed callsite inputs to context keys', () => {
  const context = buildRunCompletedPayloadPhaseCallsiteContext({
    productId: 'mouse-1',
    runId: 'run-1',
    config: { runProfile: 'thorough' },
    runtimeMode: 'balanced',
    identityFingerprint: 'idfp',
    identityLockStatus: 'locked',
    dedupeMode: 'deterministic_v2',
    summary: { validated: true },
    confidence: 0.9,
    llmCandidatesAccepted: 3,
    llmCallCount: 5,
    llmCostUsd: 0.2,
    contribution: { llmFields: ['dpi'] },
    llmEstimatedUsageCount: 4,
    llmRetryWithoutSchemaCount: 1,
    indexingHelperFlowEnabled: true,
    helperContext: { active_match: {} },
    helperFilledFields: ['dpi'],
    componentPriorFilledFields: ['sensor'],
    criticDecisions: { reject: [] },
    llmValidatorDecisions: { accept: [], reject: [] },
    phase08Extraction: { summary: {} },
    trafficLight: { counts: { green: 1, yellow: 0, red: 0 } },
    resumeMode: 'auto',
    resumeMaxAgeHours: 48,
    resumeReextractEnabled: false,
    resumeReextractAfterHours: 24,
    resumeSeededPendingCount: 0,
    resumeSeededLlmRetryCount: 0,
    resumeSeededReextractCount: 0,
    resumePersistedPendingCount: 0,
    resumePersistedLlmRetryCount: 0,
    resumePersistedSuccessCount: 0,
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: 0,
    aggressiveExtraction: { enabled: false, stage: 'disabled' },
    durationMs: 1000,
  });
  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.dedupeMode, 'deterministic_v2');
  assert.equal(context.durationMs, 1000);
  assert.deepEqual(context.summary, { validated: true });
  assert.equal(context.resumeMode, 'auto');
  assert.equal(context.resumeMaxAgeHours, 48);
});

test('buildRunLoggerBootstrapPhaseCallsiteContext maps runProduct logger-bootstrap callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { runtimeEventsKey: '_runtime/custom-events.jsonl' };
  const createEventLogger = (options) => ({ options });
  const result = buildRunLoggerBootstrapPhaseCallsiteContext({
    storage,
    config,
    runId: 'run.abc123',
    createEventLogger,
  });
  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.runId, 'run.abc123');
  assert.equal(result.createEventLogger, createEventLogger);
});

test('buildRunResultPayloadPhaseCallsiteContext maps runProduct return callsite inputs to context keys', () => {
  const context = buildRunResultPayloadPhaseCallsiteContext({
    job: { id: 1 },
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    summary: { validated: true },
    runId: 'run_123',
    productId: 'mouse-product',
    exportInfo: { artifacts: 3 },
    finalExport: { ok: true },
    learning: { accepted: 1 },
    learningGateResult: { gateResults: [] },
    categoryBrain: { keys: ['a'] },
  });
  assert.deepEqual(context.job, { id: 1 });
  assert.deepEqual(context.normalized, { fields: { dpi: 32000 } });
  assert.deepEqual(context.provenance, { dpi: [] });
  assert.deepEqual(context.summary, { validated: true });
  assert.equal(context.runId, 'run_123');
  assert.equal(context.productId, 'mouse-product');
  assert.deepEqual(context.exportInfo, { artifacts: 3 });
  assert.deepEqual(context.finalExport, { ok: true });
  assert.deepEqual(context.learning, { accepted: 1 });
  assert.deepEqual(context.learningGateResult, { gateResults: [] });
  assert.deepEqual(context.categoryBrain, { keys: ['a'] });
});

test('buildRunRuntimePhaseCallsiteContext maps runProduct runtime-bootstrap callsite inputs to context keys', () => {
  const buildRunId = () => 'run-0001';
  const result = buildRunRuntimePhaseCallsiteContext({
    runIdOverride: 'run.override',
    roundContext: { round: 1 },
    config: { runProfile: 'thorough' },
    buildRunId,
  });
  assert.equal(result.runIdOverride, 'run.override');
  assert.deepEqual(result.roundContext, { round: 1 });
  assert.deepEqual(result.config, { runProfile: 'thorough' });
  assert.equal(result.buildRunId, buildRunId);
});

test('buildRunSummaryPayloadPhaseCallsiteContext maps runProduct summary callsite inputs to context keys', () => {
  const context = buildRunSummaryPayloadPhaseCallsiteContext({
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    dedupeMode: 'deterministic_v2',
    helperContext: { stats: { active_total: 1 } },
    hypothesisFollowupRoundsExecuted: 2,
    durationMs: 1000,
    normalizeAmbiguityLevel: () => 'low',
    isHelperSyntheticSource: () => false,
    buildTopEvidenceReferences: () => [],
    nowIso: () => '2026-03-06T00:00:00.000Z',
  });
  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.category, 'mouse');
  assert.equal(context.dedupeMode, 'deterministic_v2');
  assert.deepEqual(context.helperContext, { stats: { active_total: 1 } });
  assert.equal(context.hypothesisFollowupRoundsExecuted, 2);
  assert.equal(context.durationMs, 1000);
  assert.equal(typeof context.normalizeAmbiguityLevel, 'function');
  assert.equal(typeof context.isHelperSyntheticSource, 'function');
  assert.equal(typeof context.buildTopEvidenceReferences, 'function');
  assert.equal(typeof context.nowIso, 'function');
});

test('buildRuntimeOverridesLoaderPhaseCallsiteContext maps runProduct runtime-overrides callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { marker: 'config' };
  const resolveRuntimeControlKey = () => '_runtime/runtime-control.json';
  const defaultRuntimeOverrides = () => ({ pause: false });
  const normalizeRuntimeOverrides = (payload = {}) => payload;
  const result = buildRuntimeOverridesLoaderPhaseCallsiteContext({
    storage,
    config,
    resolveRuntimeControlKey,
    defaultRuntimeOverrides,
    normalizeRuntimeOverrides,
  });
  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.resolveRuntimeControlKey, resolveRuntimeControlKey);
  assert.equal(result.defaultRuntimeOverrides, defaultRuntimeOverrides);
  assert.equal(result.normalizeRuntimeOverrides, normalizeRuntimeOverrides);
});

test('buildSourceIntelFinalizationPhaseCallsiteContext maps runProduct source-intel finalization callsite inputs to context keys', () => {
  const context = buildSourceIntelFinalizationPhaseCallsiteContext({
    storage: { id: 'storage' },
    config: { enableIntel: true },
    category: 'mouse',
    productId: 'product-1',
    brand: 'Logitech',
    sourceResults: [{ url: 'https://example.com/spec' }],
    provenance: { dpi: [{ source: 'https://example.com/spec' }] },
    categoryConfig: { key: 'mouse' },
    constraintAnalysis: { contradictions: [] },
    summary: { confidence: 0.9 },
    persistSourceIntel: async () => ({}),
  });
  assert.equal(context.storage.id, 'storage');
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'product-1');
  assert.equal(context.brand, 'Logitech');
  assert.deepEqual(context.sourceResults, [{ url: 'https://example.com/spec' }]);
  assert.deepEqual(context.provenance, { dpi: [{ source: 'https://example.com/spec' }] });
  assert.deepEqual(context.categoryConfig, { key: 'mouse' });
  assert.deepEqual(context.constraintAnalysis, { contradictions: [] });
  assert.deepEqual(context.summary, { confidence: 0.9 });
  assert.equal(typeof context.persistSourceIntel, 'function');
});

test('buildSummaryArtifactsPhaseCallsiteContext maps runProduct summary-artifacts callsite inputs to context keys', () => {
  const writeSummaryMarkdownLLM = async () => 'summary';
  const buildMarkdownSummary = () => 'fallback';
  const tsvRowFromFields = () => 'row';
  const context = buildSummaryArtifactsPhaseCallsiteContext({
    config: { writeMarkdownSummary: true },
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [{ source: 'a' }] },
    summary: { confidence: 0.9 },
    logger: { info() {} },
    llmContext: { id: 'llm' },
    writeSummaryMarkdownLLM,
    buildMarkdownSummary,
    tsvRowFromFields,
  });
  assert.deepEqual(context.config, { writeMarkdownSummary: true });
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.normalized, { fields: { dpi: 32000 } });
  assert.deepEqual(context.provenance, { dpi: [{ source: 'a' }] });
  assert.deepEqual(context.summary, { confidence: 0.9 });
  assert.equal(context.writeSummaryMarkdownLLM, writeSummaryMarkdownLLM);
  assert.equal(context.buildMarkdownSummary, buildMarkdownSummary);
  assert.equal(context.tsvRowFromFields, tsvRowFromFields);
});

test('buildTerminalLearningExportLifecyclePhaseCallsiteContext maps runProduct terminal lifecycle callsite inputs to context keys', () => {
  const learningExportPhaseContext = { id: 'phase' };
  const runLearningExportPhase = async () => ({});
  const finalizeRunLifecycle = async () => {};
  const logger = { id: 'logger' };
  const frontierDb = { id: 'frontier' };
  const emitFieldDecisionEvents = () => {};
  const context = buildTerminalLearningExportLifecyclePhaseCallsiteContext({
    learningExportPhaseContext,
    runLearningExportPhase,
    finalizeRunLifecycle,
    logger,
    frontierDb,
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: '32000' } },
    provenance: { dpi: [{ source: 'a' }] },
    fieldReasoning: [{ field: 'dpi' }],
    trafficLight: { score: 0.95 },
    emitFieldDecisionEvents,
  });
  assert.equal(context.learningExportPhaseContext, learningExportPhaseContext);
  assert.equal(context.runLearningExportPhase, runLearningExportPhase);
  assert.equal(context.finalizeRunLifecycle, finalizeRunLifecycle);
  assert.equal(context.logger, logger);
  assert.equal(context.frontierDb, frontierDb);
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.normalized, { fields: { dpi: '32000' } });
  assert.deepEqual(context.provenance, { dpi: [{ source: 'a' }] });
  assert.deepEqual(context.fieldReasoning, [{ field: 'dpi' }]);
  assert.deepEqual(context.trafficLight, { score: 0.95 });
  assert.equal(context.emitFieldDecisionEvents, emitFieldDecisionEvents);
});

test('buildRunTraceWriterPhaseCallsiteContext maps runProduct trace-writer callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { runtimeTraceEnabled: true };
  const toBool = (value, fallback) => (value === undefined ? fallback : Boolean(value));
  const createRuntimeTraceWriter = (options) => ({ options });
  const result = buildRunTraceWriterPhaseCallsiteContext({
    storage,
    config,
    runId: 'run.abc123',
    productId: 'mouse-sample',
    toBool,
    createRuntimeTraceWriter,
  });
  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.runId, 'run.abc123');
  assert.equal(result.productId, 'mouse-sample');
  assert.equal(result.toBool, toBool);
  assert.equal(result.createRuntimeTraceWriter, createRuntimeTraceWriter);
});

test('buildValidationGatePhaseCallsiteContext maps runProduct validation-gate callsite inputs to context keys', () => {
  const computeCompletenessRequiredFn = () => ({ completenessRequired: 0.8 });
  const computeCoverageOverallFn = () => ({ coverageOverall: 0.7 });
  const computeConfidenceFn = () => 0.9;
  const evaluateValidationGateFn = () => ({ validated: true, reasons: [] });
  const context = buildValidationGatePhaseCallsiteContext({
    normalized: { fields: { dpi: 240 }, quality: {} },
    requiredFields: ['dpi'],
    fieldOrder: ['dpi'],
    categoryConfig: { schema: { editorial_fields: [] } },
    identityConfidence: 0.9,
    provenance: { dpi: { source: 'a' } },
    allAnchorConflicts: [],
    consensus: { agreementScore: 1 },
    identityGate: { validated: true },
    config: {},
    targets: { targetCompleteness: 0.8, targetConfidence: 0.8 },
    anchorMajorConflictsCount: 0,
    criticalFieldsBelowPassTarget: [],
    identityFull: true,
    identityPublishThreshold: 0.75,
    computeCompletenessRequiredFn,
    computeCoverageOverallFn,
    computeConfidenceFn,
    evaluateValidationGateFn,
  });
  assert.deepEqual(context.requiredFields, ['dpi']);
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.equal(context.identityConfidence, 0.9);
  assert.equal(context.identityFull, true);
  assert.equal(context.identityPublishThreshold, 0.75);
  assert.equal(context.computeCompletenessRequiredFn, computeCompletenessRequiredFn);
  assert.equal(context.computeCoverageOverallFn, computeCoverageOverallFn);
  assert.equal(context.computeConfidenceFn, computeConfidenceFn);
  assert.equal(context.evaluateValidationGateFn, evaluateValidationGateFn);
});
