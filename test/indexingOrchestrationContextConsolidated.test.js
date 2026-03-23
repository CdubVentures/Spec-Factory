import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnalysisArtifactKeyPhaseContext,
  buildDedicatedSyntheticSourceIngestionContext,
  buildDiscoverySeedPlanContext,
  buildFetchSchedulerDrainContext,
  buildFetcherStartContext,
  buildFinalizationTelemetryContext,
  buildHypothesisFollowupsContext,
  buildIdentityBootstrapContext,
  buildIdentityReportPersistenceContext,
  buildLearningGateContext,
  buildPlannerBootstrapContext,
  buildPostLearningUpdatesContext,
  buildResearchArtifactsPhaseContext,
  buildResearchBootstrapContext,
  buildRunBootstrapLogPayloadContext,
  buildRunCompletedEventContext,
  buildRunLoggerBootstrapContext,
  buildRunResultPayloadContext,
  buildRunRuntimeContext,
  buildRunTraceWriterContext,
  buildRuntimeOverridesLoaderContext,
  buildSourceIntelFinalizationContext,
  buildSummaryArtifactsPhaseContext,
  buildTerminalLearningExportLifecycleContext,
  createRunRuntime,
} from '../src/features/indexing/orchestration/index.js';

test('buildAnalysisArtifactKeyPhaseContext maps runProduct analysis-key inputs to context contract keys', () => {
  const context = buildAnalysisArtifactKeyPhaseContext({
    storage: { marker: 'storage' },
    category: 'mouse',
    productId: 'mouse-product',
    runBase: 'runs/base',
    summary: { validated: true },
  });
  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'mouse-product');
  assert.equal(context.runBase, 'runs/base');
  assert.deepEqual(context.summary, { validated: true });
});

test('buildDedicatedSyntheticSourceIngestionContext maps dedicated ingestion inputs to phase contract keys', () => {
  const adapterManager = { id: 'adapter-manager' };
  const job = { identityLock: { brand: 'Logitech' } };
  const storage = { id: 'storage' };
  const helperSupportiveSyntheticSources = [{ url: 'helper://supportive/1' }];
  const adapterArtifacts = [{ key: 'artifact-1' }];
  const sourceResults = [{ url: 'https://existing.example/spec' }];
  const anchors = { brand: 'brand' };
  const config = {};
  const buildCandidateFieldMap = () => ({ connection: 'wired' });
  const evaluateAnchorConflicts = () => ({ conflicts: [], majorConflicts: [] });
  const evaluateSourceIdentity = () => ({ match: true, score: 0.9 });
  const context = buildDedicatedSyntheticSourceIngestionContext({
    adapterManager,
    job,
    runId: 'run-1',
    storage,
    helperSupportiveSyntheticSources,
    adapterArtifacts,
    sourceResults,
    anchors,
    config,
    buildCandidateFieldMap,
    evaluateAnchorConflicts,
    evaluateSourceIdentity,
  });
  assert.equal(context.adapterManager, adapterManager);
  assert.equal(context.job, job);
  assert.equal(context.runId, 'run-1');
  assert.equal(context.storage, storage);
  assert.equal(context.helperSupportiveSyntheticSources, helperSupportiveSyntheticSources);
  assert.equal(context.adapterArtifacts, adapterArtifacts);
  assert.equal(context.sourceResults, sourceResults);
  assert.equal(context.anchors, anchors);
  assert.equal(context.config, config);
  assert.equal(context.buildCandidateFieldMapFn, buildCandidateFieldMap);
  assert.equal(context.evaluateAnchorConflictsFn, evaluateAnchorConflicts);
  assert.equal(context.evaluateSourceIdentityFn, evaluateSourceIdentity);
});

test('buildDiscoverySeedPlanContext maps runProduct discovery-seed inputs to phase contract keys', () => {
  const normalizeFieldList = (value) => value;
  const context = buildDiscoverySeedPlanContext({
    config: { id: 'cfg' },
    runtimeOverrides: { id: 'runtime' },
    storage: { id: 'storage' },
    category: 'mouse',
    categoryConfig: { id: 'cat' },
    job: { id: 'job' },
    runId: 'run-1',
    logger: { info() {} },
    roundContext: { round: 0 },
    requiredFields: ['name'],
    llmContext: { id: 'llm' },
    frontierDb: { id: 'frontier' },
    traceWriter: { id: 'trace' },
    learningStoreHints: { id: 'hints' },
    planner: { id: 'planner' },
    normalizeFieldList,
  });
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.normalizeFieldListFn, normalizeFieldList);
});

test('buildFetchSchedulerDrainContext maps runProduct scheduler inputs to drain contract keys', () => {
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
  const context = buildFetchSchedulerDrainContext({
    planner: { hasNext: () => false },
    config: {},
    initialMode: 'http',
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
  assert.equal(typeof context.planner.hasNext, 'function');
  assert.deepEqual(context.config, {});
  assert.equal(context.initialMode, 'http');
  assert.equal(context.prepareNextPlannerSourceFn, prepareNextPlannerSource);
  assert.equal(context.fetchFn, fetchFn);
  assert.equal(context.fetchWithModeFn, fetchWithModeFn);
  assert.equal(context.shouldSkipFn, shouldSkipPreflight);
  assert.equal(context.shouldStopFn, shouldStopScheduler);
  assert.equal(context.classifyOutcomeFn, classifyOutcomeFn);
  assert.equal(context.onFetchError, handleSchedulerFetchError);
  assert.equal(context.onSkipped, handleSchedulerSkipped);
  assert.equal(context.emitEvent, emitSchedulerEvent);
  assert.equal(context.createFetchSchedulerFn, createFetchScheduler);
});

test('buildFetcherStartContext assembles fetcher-start inputs and creates http fetcher factory', () => {
  class FakeHttpFetcher {
    constructor(config, logger) {
      this.config = config;
      this.logger = logger;
    }
  }
  const context = buildFetcherStartContext({
    fetcher: { id: 'fetcher' },
    fetcherMode: 'playwright',
    config: { dryRun: false },
    logger: { info() {} },
    fetcherConfig: { id: 'cfg' },
    HttpFetcherClass: FakeHttpFetcher,
  });
  assert.equal(context.fetcherMode, 'playwright');
  assert.equal(context.fetcherConfig.id, 'cfg');
  const created = context.createHttpFetcherFn({ id: 'next' }, { info() {} });
  assert.equal(created instanceof FakeHttpFetcher, true);
  assert.deepEqual(created.config, { id: 'next' });
});

test('buildFinalizationTelemetryContext maps runProduct finalization telemetry inputs to phase contract keys', () => {
  const buildFinalizationEventPayloads = () => ({});
  const emitFinalizationEvents = () => {};
  const context = buildFinalizationTelemetryContext({
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
    buildFinalizationEventPayloads,
    emitFinalizationEvents,
  });
  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.category, 'mouse');
  assert.equal(context.buildFinalizationEventPayloadsFn, buildFinalizationEventPayloads);
  assert.equal(context.emitFinalizationEventsFn, emitFinalizationEvents);
});

test('buildHypothesisFollowupsContext maps runProduct follow-up inputs to phase contract keys', () => {
  const processPlannerQueue = async () => {};
  const context = buildHypothesisFollowupsContext({
    config: { maxRunSeconds: 60 },
    startMs: 123,
    logger: { info() {} },
    planner: { id: 'planner' },
    processPlannerQueue,
    sourceResults: [{ id: 1 }],
    categoryConfig: { id: 'cat' },
    fieldOrder: ['name'],
    anchors: { name: {} },
    job: { id: 'job' },
    productId: 'product-1',
    category: 'mouse',
    requiredFields: ['name'],
    sourceIntel: { id: 'intel' },
    hypothesisFollowupRoundsExecuted: 2,
    hypothesisFollowupSeededUrls: new Set(['https://example.com']),
    isHelperSyntheticSourceFn: () => false,
  });
  assert.equal(context.processPlannerQueueFn, processPlannerQueue);
  assert.equal(context.productId, 'product-1');
  assert.equal(context.category, 'mouse');
  assert.equal(context.hypothesisFollowupRoundsExecuted, 2);
});

test('buildIdentityBootstrapContext maps runProduct identity bootstrap inputs to phase contract keys', () => {
  const resolveIdentityAmbiguitySnapshot = async () => ({ family_model_count: 1 });
  const normalizeAmbiguityLevel = () => 'low';
  const buildRunIdentityFingerprint = () => 'idfp';
  const resolveIdentityLockStatus = () => 'locked';
  const context = buildIdentityBootstrapContext({
    job: { identityLock: { brand: 'Logitech' } },
    config: { profile: 'test' },
    category: 'mouse',
    productId: 'mouse-sample',
    resolveIdentityAmbiguitySnapshot,
    normalizeAmbiguityLevel,
    buildRunIdentityFingerprint,
    resolveIdentityLockStatus,
  });
  assert.deepEqual(context.job, { identityLock: { brand: 'Logitech' } });
  assert.deepEqual(context.config, { profile: 'test' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'mouse-sample');
  assert.equal(
    context.resolveIdentityAmbiguitySnapshotFn,
    resolveIdentityAmbiguitySnapshot,
  );
  assert.equal(context.normalizeAmbiguityLevelFn, normalizeAmbiguityLevel);
  assert.equal(context.buildRunIdentityFingerprintFn, buildRunIdentityFingerprint);
  assert.equal(context.resolveIdentityLockStatusFn, resolveIdentityLockStatus);
});

test('buildIdentityReportPersistenceContext maps runProduct identity-report inputs to phase contract keys', () => {
  const storage = { id: 'storage' };
  const summary = { validated: true };
  const identityReport = { score: 0.92 };
  const context = buildIdentityReportPersistenceContext({
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

test('buildLearningGateContext maps runProduct learning-gate inputs to phase contract keys', () => {
  const evaluateFieldLearningGates = () => ({ gateResults: [], acceptedUpdates: [] });
  const emitLearningGateEvents = () => {};
  const context = buildLearningGateContext({
    fieldOrder: ['dpi'],
    fields: { dpi: '32000' },
    provenance: { dpi: [{ source: 'https://example.com' }] },
    category: 'mouse',
    runId: 'run-1',
    runtimeFieldRulesEngine: { id: 'rules' },
    config: { selfImproveEnabled: true },
    logger: { info() {} },
    evaluateFieldLearningGates,
    emitLearningGateEvents,
  });
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.fields, { dpi: '32000' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.evaluateFieldLearningGatesFn, evaluateFieldLearningGates);
  assert.equal(context.emitLearningGateEventsFn, emitLearningGateEvents);
});

test('buildPlannerBootstrapContext maps runProduct planner bootstrap inputs to phase contract keys', () => {
  const createSourcePlanner = (...args) => ({ args });
  const context = buildPlannerBootstrapContext({
    storage: { marker: 'storage' },
    config: { marker: 'config' },
    logger: { marker: 'logger' },
    category: 'mouse',
    job: { productId: 'mouse-sample' },
    categoryConfig: { fieldOrder: ['dpi'] },
    requiredFields: ['dpi'],
    createAdapterManager: () => ({ marker: 'adapter-manager' }),
    loadSourceIntel: async () => ({ data: {} }),
    createSourcePlanner,
    syncRuntimeOverrides: async () => ({}),
    applyRuntimeOverridesToPlanner: () => {},
  });
  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, { marker: 'config' });
  assert.deepEqual(context.logger, { marker: 'logger' });
  assert.equal(context.category, 'mouse');
  assert.deepEqual(context.job, { productId: 'mouse-sample' });
  assert.deepEqual(context.categoryConfig, { fieldOrder: ['dpi'] });
  assert.deepEqual(context.requiredFields, ['dpi']);
  assert.equal(typeof context.createAdapterManagerFn, 'function');
  assert.equal(typeof context.loadSourceIntelFn, 'function');
  assert.equal(context.createSourcePlannerFn, createSourcePlanner);
  assert.equal(typeof context.syncRuntimeOverridesFn, 'function');
  assert.equal(typeof context.applyRuntimeOverridesToPlannerFn, 'function');
});

test('buildPostLearningUpdatesContext maps runProduct post-learning inputs to phase contract keys', () => {
  const updateCategoryBrain = async () => ({});
  const updateComponentLibrary = async () => ({});
  const context = buildPostLearningUpdatesContext({
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
    updateCategoryBrain,
    updateComponentLibrary,
  });
  assert.equal(context.storage.id, 'storage');
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.updateCategoryBrainFn, updateCategoryBrain);
  assert.equal(context.updateComponentLibraryFn, updateComponentLibrary);
});

test('buildResearchArtifactsPhaseContext maps runProduct research-artifacts inputs to phase contract keys', () => {
  const context = buildResearchArtifactsPhaseContext({
    uberAggressiveMode: true,
    frontierDb: { marker: 'frontier' },
    uberOrchestrator: { marker: 'orchestrator' },
    storage: { marker: 'storage' },
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run_123',
    discoveryResult: { queries: ['q'] },
    previousFinalSpec: { fields: {} },
    normalized: { fields: { dpi: 32000 } },
    fieldOrder: ['dpi'],
    summary: { validated: true },
    runtimeMode: 'uber_aggressive',
  });
  assert.equal(context.uberAggressiveMode, true);
  assert.deepEqual(context.frontierDb, { marker: 'frontier' });
  assert.deepEqual(context.uberOrchestrator, { marker: 'orchestrator' });
  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'mouse-product');
  assert.equal(context.runId, 'run_123');
  assert.deepEqual(context.discoveryResult, { queries: ['q'] });
  assert.deepEqual(context.previousFinalSpec, { fields: {} });
  assert.deepEqual(context.normalized, { fields: { dpi: 32000 } });
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.summary, { validated: true });
  assert.equal(context.runtimeMode, 'uber_aggressive');
});

test('buildResearchBootstrapContext maps runProduct research bootstrap inputs to phase contract keys', () => {
  const createFrontier = () => ({ load: async () => {} });
  const createUberAggressiveOrchestrator = () => ({ marker: 'orchestrator' });
  const context = buildResearchBootstrapContext({
    storage: { marker: 'storage' },
    config: {},
    logger: { marker: 'logger' },
    createFrontier,
    createUberAggressiveOrchestrator,
  });
  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, {});
  assert.deepEqual(context.logger, { marker: 'logger' });
  assert.equal(context.createFrontierFn, createFrontier);
  assert.equal(
    context.createUberAggressiveOrchestratorFn,
    createUberAggressiveOrchestrator,
  );
});

test('buildRunBootstrapLogPayloadContext maps runProduct bootstrap log inputs to payload contract keys', () => {
  const context = buildRunBootstrapLogPayloadContext({
    s3Key: 'specs/inputs/mouse/products/sample.json',
    runId: 'run.abc123',
    roundContext: { round: 1 },
    category: 'mouse',
    productId: 'mouse-sample',
    config: { runProfile: 'thorough' },
    runtimeMode: 'balanced',
    identityFingerprint: 'idfp',
    identityLockStatus: 'locked',
    identityLock: { family_model_count: 2 },
    dedupeMode: 'serp_url+content_hash',
  });
  assert.equal(context.s3Key, 'specs/inputs/mouse/products/sample.json');
  assert.equal(context.runId, 'run.abc123');
  assert.deepEqual(context.roundContext, { round: 1 });
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'mouse-sample');
  assert.deepEqual(context.config, { runProfile: 'thorough' });
  assert.equal(context.runtimeMode, 'balanced');
  assert.equal(context.identityFingerprint, 'idfp');
  assert.equal(context.identityLockStatus, 'locked');
  assert.deepEqual(context.identityLock, { family_model_count: 2 });
  assert.equal(context.dedupeMode, 'serp_url+content_hash');
});

test('buildRunCompletedEventContext maps runProduct run_completed emission inputs to phase contract keys', () => {
  const logger = { info() {} };
  const runCompletedPayload = { runId: 'run-1', productId: 'mouse-1' };
  const context = buildRunCompletedEventContext({
    logger,
    runCompletedPayload,
  });
  assert.equal(context.logger, logger);
  assert.equal(context.runCompletedPayload, runCompletedPayload);
});

test('createRunRuntime preserves valid runId override and returns production mode', () => {
  const result = createRunRuntime({
    runIdOverride: 'run.abc123',
    roundContext: {},
    config: {},
    buildRunIdFn: () => 'generated-run-0001',
  });
  assert.equal(result.runId, 'run.abc123');
  assert.equal(result.runtimeMode, 'production');
});
test('createRunRuntime falls back to generated runId and returns production mode', () => {
  const result = createRunRuntime({
    runIdOverride: 'short',
    roundContext: null,
    config: {},
    buildRunIdFn: () => 'generated-run-0002',
  });
  assert.equal(result.runId, 'generated-run-0002');
  assert.equal(result.runtimeMode, 'production');
});
test('createRunRuntime ignores legacy accuracyMode and returns production mode', () => {
  const result = createRunRuntime({
    runIdOverride: '',
    roundContext: {},
    config: {},
    buildRunIdFn: () => 'generated-run-0003',
  });
  assert.equal(result.runId, 'generated-run-0003');
  assert.equal(result.runtimeMode, 'production');
});

test('buildRunLoggerBootstrapContext maps runProduct logger bootstrap inputs to phase contract keys', () => {
  const createEventLogger = () => ({ info() {} });
  const context = buildRunLoggerBootstrapContext({
    storage: { marker: 'storage' },
    config: { runtimeEventsKey: '_runtime/custom-events.jsonl' },
    runId: 'run.abc123',
    createEventLogger,
  });
  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, { runtimeEventsKey: '_runtime/custom-events.jsonl' });
  assert.equal(context.runId, 'run.abc123');
  assert.equal(context.createEventLoggerFn, createEventLogger);
});

test('buildRunResultPayloadContext maps runProduct return-envelope inputs to payload contract keys', () => {
  const context = buildRunResultPayloadContext({
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

test('buildRunRuntimeContext maps runProduct runtime bootstrap inputs to createRunRuntime contract keys', () => {
  const buildRunId = () => 'run-0001';
  const context = buildRunRuntimeContext({
    runIdOverride: 'run.override',
    roundContext: { round: 1 },
    config: { runProfile: 'thorough' },
    buildRunId,
  });
  assert.equal(context.runIdOverride, 'run.override');
  assert.deepEqual(context.roundContext, { round: 1 });
  assert.deepEqual(context.config, { runProfile: 'thorough' });
  assert.equal(context.buildRunIdFn, buildRunId);
});

test('buildRuntimeOverridesLoaderContext maps runProduct runtime-overrides inputs to loader contract keys', () => {
  const resolveRuntimeControlKey = () => '_runtime/runtime-control.json';
  const defaultRuntimeOverrides = () => ({ pause: false });
  const normalizeRuntimeOverrides = (payload = {}) => payload;
  const context = buildRuntimeOverridesLoaderContext({
    storage: { marker: 'storage' },
    config: { marker: 'config' },
    resolveRuntimeControlKey,
    defaultRuntimeOverrides,
    normalizeRuntimeOverrides,
  });
  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, { marker: 'config' });
  assert.equal(context.resolveRuntimeControlKeyFn, resolveRuntimeControlKey);
  assert.equal(context.defaultRuntimeOverridesFn, defaultRuntimeOverrides);
  assert.equal(context.normalizeRuntimeOverridesFn, normalizeRuntimeOverrides);
});

test('buildSourceIntelFinalizationContext maps runProduct source-intel inputs to phase contract keys', () => {
  const context = buildSourceIntelFinalizationContext({
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
  assert.equal(typeof context.persistSourceIntelFn, 'function');
});

test('buildSummaryArtifactsPhaseContext maps runProduct summary-artifact inputs to phase contract keys', () => {
  const writeSummaryMarkdownLLM = async () => 'summary';
  const buildMarkdownSummary = () => 'fallback';
  const tsvRowFromFields = () => 'row';
  const context = buildSummaryArtifactsPhaseContext({
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
  assert.equal(typeof context.writeSummaryMarkdownLLMFn, 'function');
  assert.equal(context.buildMarkdownSummaryFn, buildMarkdownSummary);
  assert.equal(context.tsvRowFromFieldsFn, tsvRowFromFields);
});

test('buildTerminalLearningExportLifecycleContext maps runProduct terminal lifecycle inputs to phase contract keys', () => {
  const learningExportPhaseContext = { id: 'phase' };
  const runLearningExportPhase = async () => ({});
  const finalizeRunLifecycle = async () => {};
  const logger = { id: 'logger' };
  const frontierDb = { id: 'frontier' };
  const emitFieldDecisionEvents = () => {};
  const context = buildTerminalLearningExportLifecycleContext({
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
  assert.equal(context.runLearningExportPhaseFn, runLearningExportPhase);
  assert.equal(context.finalizeRunLifecycleFn, finalizeRunLifecycle);
  assert.equal(context.logger, logger);
  assert.equal(context.frontierDb, frontierDb);
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.normalized, { fields: { dpi: '32000' } });
  assert.deepEqual(context.provenance, { dpi: [{ source: 'a' }] });
  assert.deepEqual(context.fieldReasoning, [{ field: 'dpi' }]);
  assert.deepEqual(context.trafficLight, { score: 0.95 });
  assert.equal(context.emitFieldDecisionEventsFn, emitFieldDecisionEvents);
});

test('buildRunTraceWriterContext maps runProduct trace-writer inputs to bootstrap contract keys', () => {
  const createRuntimeTraceWriter = () => ({ marker: 'trace' });
  const toBool = (value, fallback) => (value === undefined ? fallback : Boolean(value));
  const context = buildRunTraceWriterContext({
    storage: { marker: 'storage' },
    config: { runtimeTraceEnabled: true },
    runId: 'run.abc123',
    productId: 'mouse-sample',
    toBool,
    createRuntimeTraceWriter,
  });
  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, { runtimeTraceEnabled: true });
  assert.equal(context.runId, 'run.abc123');
  assert.equal(context.productId, 'mouse-sample');
  assert.equal(context.toBoolFn, toBool);
  assert.equal(context.createRuntimeTraceWriterFn, createRuntimeTraceWriter);
});
