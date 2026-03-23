import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProcessPlannerQueueExecutionContexts,
  createProcessPlannerQueueMutableState,
  runPlannerQueueSnapshotPhase,
  runProcessPlannerQueuePhase,
} from '../src/features/indexing/orchestration/index.js';

test('runPlannerQueueSnapshotPhase writes planner trace snapshot and emits queue snapshot telemetry', async () => {
  const traceCalls = [];
  const logs = [];
  const blockedHosts = Array.from({ length: 20 }, (_, index) => `host-${index}`);

  await runPlannerQueueSnapshotPhase({
    traceWriter: {
      async writeJson(payload) {
        traceCalls.push(payload);
        return { trace_path: 'trace/planner/queue_snapshot.json' };
      },
    },
    planner: {
      manufacturerQueue: ['m1', 'm2'],
      queue: ['q1'],
      candidateQueue: ['c1', 'c2', 'c3'],
      blockedHosts: new Set(blockedHosts),
      getStats() {
        return { queued: 6 };
      },
    },
    logger: {
      info(eventName, payload) {
        logs.push({ eventName, payload });
      },
    },
    nowIsoFn: () => '2026-03-06T12:00:00.000Z',
  });

  assert.equal(traceCalls.length, 1);
  assert.deepEqual(traceCalls[0], {
    section: 'planner',
    prefix: 'queue_snapshot',
    payload: {
      ts: '2026-03-06T12:00:00.000Z',
      pending_count: 6,
      blocked_hosts: blockedHosts.slice(0, 60),
      stats: { queued: 6 },
    },
    ringSize: 20,
  });
  assert.deepEqual(logs, [{
    eventName: 'planner_queue_snapshot_written',
    payload: {
      pending_count: 6,
      blocked_hosts: blockedHosts.slice(0, 12),
      trace_path: 'trace/planner/queue_snapshot.json',
    },
  }]);
});

test('runPlannerQueueSnapshotPhase is a no-op when trace writer is unavailable', async () => {
  let logged = false;
  await runPlannerQueueSnapshotPhase({
    traceWriter: null,
    planner: {
      getStats() {
        return {};
      },
    },
    logger: {
      info() {
        logged = true;
      },
    },
  });

  assert.equal(logged, false);
});

function createMinimalExtractionContext() {
  return {
    runtimeOverrides: {},
    maybeApplyBlockedDomainCooldown: () => {},
    blockedDomainHitCount: new Map(),
    blockedDomainThreshold: 1,
    blockedDomainsApplied: new Set(),
    planner: {
      discoverFromHtml: () => {},
      discoverFromRobots: () => {},
      discoverFromSitemap: () => {},
      enqueue: () => {},
      markFieldsFilled: () => {},
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    normalizeHostToken: (value = '') => String(value || ''),
    hostFromHttpUrl: () => '',
    isRobotsTxtUrl: () => false,
    isSitemapUrl: () => false,
    hasSitemapXmlSignals: () => false,
    isDiscoveryOnlySourceUrl: () => false,
    mineEndpointSignals: () => ({
      endpointSignals: [],
      nextBestUrls: [],
    }),
    categoryConfig: { criticalFieldSet: new Set() },
    config: {},
    buildSiteFingerprint: () => ({}),
    isLikelyIndexableEndpointUrl: () => false,
    isSafeManufacturerFollowupUrl: () => false,
    extractCandidatesFromPage: () => ({
      identityCandidates: {},
      fieldCandidates: [],
      staticDom: {
        parserStats: {},
        auditRejectedFieldCandidates: [],
      },
      structuredMetadata: {
        stats: {},
        snippetRows: [],
        errors: [],
      },
    }),
    job: { identityLock: {} },
    adapterManager: {
      extractForPage: async () => ({
        additionalUrls: [],
        fieldCandidates: [],
        identityCandidates: {},
        pdfDocs: [],
        adapterArtifacts: [],
      }),
    },
    runId: 'run-test',
    dedupeCandidates: (rows = []) => rows,
    buildEvidencePack: () => null,
    llmTargetFields: [],
    fetcherMode: 'http',
    productId: 'mouse-test',
    category: 'mouse',
    sha256: (value = '') => `sha256:${String(value)}`,
    deterministicParser: null,
    componentResolver: null,
    llmSatisfiedFields: new Set(),
    anchors: {},
    isIdentityLockedField: () => false,
    isAnchorLocked: () => false,
    extractCandidatesLLM: async () => ({
      identityCandidates: {},
      fieldCandidates: [],
      conflicts: [],
      notes: [],
    }),
    goldenExamples: [],
    llmContext: {},
    runtimeFieldRulesEngine: null,
    shouldQueueLlmRetry: () => false,
    llmRetryReasonByUrl: new Map(),
    phase08BatchRows: [],
    mergePhase08Rows: (rows = []) => rows,
    enrichFieldCandidatesWithEvidenceRefs: (rows = []) => rows,
    extractTemporalSignals: () => ({}),
    buildCandidateFieldMap: () => ({}),
    evaluateAnchorConflicts: () => ({
      majorConflicts: [],
      conflicts: [],
    }),
    evaluateSourceIdentity: () => ({
      match: false,
      score: 0,
      reasons: [],
      criticalConflicts: [],
    }),
    applyIdentityGateToCandidates: (rows = []) => rows,
    computeParserHealth: () => ({}),
    sourceResults: [],
    successfulSourceMetaByUrl: new Map(),
    frontierDb: {
      recordFetch: () => ({}),
      recordYield: () => ({}),
    },
    repairSearchEnabled: false,
    repairDedupeRule: 'domain_once',
    repairQueryByDomain: new Set(),
    requiredFields: [],
    buildRepairSearchQuery: () => '',
    toFloat: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    artifactsByHost: {},
    adapterArtifacts: [],
    markSatisfiedLlmFields: () => {},
    bumpHostOutcome: () => {},
    noteHostRetryTs: () => {},
    applyHostBudgetBackoff: () => {},
    resolveHostBudgetState: () => ({ score: 100, state: 'active' }),
    traceWriter: null,
    buildSourceFetchClassificationPhase: () => ({
      fetchContentType: 'text/html',
      sourceFetchOutcome: 'ok',
    }),
    classifyFetchOutcome: () => 'ok',
    runSourceArtifactsPhase: async ({ artifactSequence = 0 } = {}) => ({
      domSnippetArtifact: null,
      artifactHostKey: 'example.com__0000',
      domSnippetUri: '',
      screenshotArtifact: null,
      screenshotUri: '',
      screenshotFileUri: '',
      nextArtifactSequence: artifactSequence + 1,
    }),
    runArtifactsBase: 'runs/test',
    storage: null,
    buildDomSnippetArtifact: () => null,
    toInt: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    screenshotExtension: () => 'jpeg',
    screenshotMimeType: () => 'image/jpeg',
    sha256Buffer: () => 'sha256:buffer',
    fetcher: { fetch: async () => ({}) },
    fetchHostConcurrencyGate: { run: async ({ task }) => task() },
    fetchWithModeFn: async () => ({}),
    runWithRetry: async (task) => task(),
    resumeFetchFailedUrls: new Set(),
    resumeCooldownSkippedUrls: new Set(),
    syncRuntimeOverrides: () => {},
    applyRuntimeOverridesToPlanner: () => {},
    runtimeControlKey: 'runtime',
    wait: async () => {},
    startMs: Date.now(),
    ensureHostBudgetRow: () => ({}),
    hostBudgetByHost: new Map(),
    attemptedSourceUrls: new Set(),
  };
}

test('buildProcessPlannerQueueExecutionContexts wires real source extraction through processing context', async () => {
  const context = createMinimalExtractionContext();
  const executionContexts = buildProcessPlannerQueueExecutionContexts(context);

  const result = await executionContexts.sourceFetchProcessingDispatchContext.sourceProcessingContext.runSourceExtractionFn({
    source: {
      url: 'https://example.com/specs',
      host: 'example.com',
      role: 'review',
      approvedDomain: true,
    },
    pageData: {
      html: '<html><body>weight 54g</body></html>',
      finalUrl: 'https://example.com/specs',
      status: 200,
      title: 'Example Spec',
    },
    sourceStatusCode: 200,
    fetchDurationMs: 120,
    fetchContentType: 'text/html',
    sourceFetchOutcome: 'ok',
    parseStartedAtMs: 0,
    hostBudgetRow: {},
    artifactHostKey: 'example.com__0000',
    domSnippetArtifact: null,
    domSnippetUri: '',
    screenshotArtifact: null,
    screenshotUri: '',
    screenshotFileUri: '',
    phase08FieldContexts: {},
    phase08PrimeRows: [],
    llmSourcesUsed: 0,
    llmCandidatesAccepted: 0,
  });

  assert.equal(context.sourceResults.length, 1);
  assert.equal(context.sourceResults[0].status, 200);
  assert.equal(context.sourceResults[0].finalUrl, 'https://example.com/specs');
  assert.deepEqual(result.phase08FieldContexts, {});
  assert.deepEqual(result.phase08PrimeRows, []);
  assert.equal(result.llmSourcesUsed, 0);
  assert.equal(result.llmCandidatesAccepted, 0);
  assert.ok(Object.isFrozen(executionContexts.sourceExtractionPhaseContext.contracts.sourceFinalization));
  assert.equal(
    executionContexts.sourceExtractionPhaseContext.contracts.sourceFinalization,
    executionContexts.sourceExtractionPhaseContext.sourceFinalizationContext,
  );
});

test('createProcessPlannerQueueMutableState tracks runtime/queue/phase state and exports final snapshot', () => {
  const state = createProcessPlannerQueueMutableState({
    initialState: {
      runtimePauseAnnounced: false,
      artifactSequence: 7,
      phase08FieldContexts: ['field-a'],
      phase08PrimeRows: ['prime-a'],
      llmSourcesUsed: ['source-a'],
      llmCandidatesAccepted: ['candidate-a'],
      runtimeOverrides: { blocked_domains: ['example.com'] },
    },
  });

  assert.equal(state.getRuntimePauseAnnounced(), false);
  assert.equal(state.getArtifactSequence(), 7);
  assert.equal(state.getFetchWorkerSeq(), 0);
  assert.deepEqual(state.getRuntimeOverrides(), { blocked_domains: ['example.com'] });
  assert.deepEqual(state.getPhaseState(), {
    phase08FieldContexts: ['field-a'],
    phase08PrimeRows: ['prime-a'],
    llmSourcesUsed: ['source-a'],
    llmCandidatesAccepted: ['candidate-a'],
  });

  state.setRuntimePauseAnnounced(true);
  state.setFetchWorkerSeq(5);
  state.setArtifactSequence(11);
  state.setPhaseState({
    phase08FieldContexts: ['field-b'],
    phase08PrimeRows: ['prime-b'],
    llmSourcesUsed: ['source-b'],
    llmCandidatesAccepted: ['candidate-b'],
  });

  assert.deepEqual(state.toResult(), {
    runtimePauseAnnounced: true,
    fetchWorkerSeq: 5,
    artifactSequence: 11,
    phase08FieldContexts: ['field-b'],
    phase08PrimeRows: ['prime-b'],
    llmSourcesUsed: ['source-b'],
    llmCandidatesAccepted: ['candidate-b'],
  });
});

test('runProcessPlannerQueuePhase delegates planner queue dispatch and returns updated orchestration state', async () => {
  const plannerQueueDispatchState = {
    runtimePauseAnnounced: true,
    fetchWorkerSeq: 4,
    artifactSequence: 13,
    terminalReason: 'max_run_seconds_reached',
  };
  const receivedInitialModes = [];

  const result = await runProcessPlannerQueuePhase({
    initialState: {
      runtimePauseAnnounced: false,
      artifactSequence: 12,
      phase08FieldContexts: [],
      phase08PrimeRows: [],
      llmSourcesUsed: [],
      llmCandidatesAccepted: [],
      runtimeOverrides: { blocked_domains: [] },
    },
    context: {
      fetcherMode: 'http',
    },
    runPlannerQueueDispatchPhaseFn: async (input) => {
      receivedInitialModes.push(input.initialMode);
      return plannerQueueDispatchState;
    },
  });

  assert.equal(result.runtimePauseAnnounced, true);
  assert.equal(result.artifactSequence, 13);
  assert.equal(result.fetchWorkerSeq, 4);
  assert.equal(result.terminalReason, 'max_run_seconds_reached');
  assert.deepEqual(receivedInitialModes, ['http']);
});
