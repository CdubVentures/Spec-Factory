import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRunLlmRuntime } from '../src/features/indexing/orchestration/bootstrap/createRunLlmRuntime.js';
import { pathToFileURL } from 'node:url';
import { runProductCompletionLifecycle } from '../src/features/indexing/orchestration/finalize/runProductCompletionLifecycle.js';
import { runProductFinalizationDerivation } from '../src/features/indexing/orchestration/finalize/runProductFinalizationDerivation.js';
import { runProductFinalizationPipeline } from '../src/features/indexing/orchestration/finalize/runProductFinalizationPipeline.js';
import {
  buildRunBootstrapLogPayload,
  createPlannerBootstrap,
  createPlannerQueueRuntime,
  createProductCompletionRuntime,
  createProductFinalizationDerivationRuntime,
  createProductFinalizationPipelineRuntime,
  createResearchBootstrap,
  createRunLoggerBootstrap,
  createRunTraceWriter,
  createRuntimeOverridesLoader,
  runFetchSchedulerDrain,
  runFetcherStartPhase,
  runProcessPlannerQueuePhase,
} from '../src/features/indexing/orchestration/index.js';

test('runFetchSchedulerDrain prefetches process entries, wires scheduler callbacks, and forwards scheduler config', async () => {
  const sequence = [
    { mode: 'skip' },
    { mode: 'process', source: { url: 'https://a.example' }, sourceHost: 'a.example', hostBudgetRow: {} },
    { mode: 'process', source: { url: 'https://b.example' }, sourceHost: 'b.example', hostBudgetRow: {}, skip: true },
    { mode: 'stop' },
  ];
  let nextIndex = 0;
  const planner = {
    hasNext() {
      return nextIndex < sequence.length;
    },
  };
  const prepareCalls = [];
  const fetchCalls = [];
  const skippedCalls = [];
  const errorCalls = [];
  const emitted = [];
  const schedulerConfigCalls = [];
  const drainCalls = [];
  const fetchedUrls = [];
  const modeFetchCalls = [];
  const classifiedOutcomes = [];

  await runFetchSchedulerDrain({
    planner,
    config: {
      concurrency: 7,
      perHostMinDelayMs: 222,
      fetchSchedulerMaxRetries: 3,
      fetchSchedulerDefaultConcurrency: 4,
      fetchSchedulerDefaultDelayMs: 333,
      fetchSchedulerDefaultMaxRetries: 2,
      fetchSchedulerRetryWaitMs: 444,
    },
    initialMode: 'http',
    prepareNextPlannerSourceFn: async () => {
      const row = sequence[nextIndex++];
      prepareCalls.push(row.mode);
      return row;
    },
    fetchFn: async (preflight) => {
      fetchCalls.push(preflight.source.url);
      fetchedUrls.push(preflight.source.url);
      return { ok: true };
    },
    fetchWithModeFn: async (preflight, mode) => {
      modeFetchCalls.push({ url: preflight.source.url, mode });
      return { ok: true };
    },
    shouldSkipFn: (preflight) => Boolean(preflight.skip),
    shouldStopFn: () => false,
    classifyOutcomeFn: (error) => {
      classifiedOutcomes.push(String(error?.message || ''));
      return 'fetch_error';
    },
    onFetchError: (preflight, error) => {
      errorCalls.push({ preflight, error });
    },
    onSkipped: (preflight) => {
      skippedCalls.push(preflight.source.url);
    },
    emitEvent: (name, payload) => {
      emitted.push({ name, payload });
    },
    createFetchSchedulerFn: (config) => {
      schedulerConfigCalls.push(config);
      return {
        async drainQueue(args) {
          drainCalls.push(args);
        while (args.sources.hasNext()) {
          const scheduledSource = args.sources.next();
          if (args.shouldSkip(scheduledSource)) {
            args.onSkipped(scheduledSource);
            continue;
          }
          assert.equal(args.initialMode, 'http');
          assert.equal(scheduledSource.url, 'https://a.example');
          assert.equal(scheduledSource.host, 'a.example');
          assert.equal(scheduledSource.source.url, 'https://a.example');
          await args.fetchFn(scheduledSource);
            await args.fetchWithMode(scheduledSource, 'playwright');
            args.classifyOutcome(new Error('blocked'));
          }
        },
      };
    },
  });

  assert.deepEqual(prepareCalls, ['skip', 'process', 'process', 'stop']);
  assert.equal(fetchCalls.length, 1);
  assert.deepEqual(fetchedUrls, ['https://a.example']);
  assert.deepEqual(skippedCalls, ['https://b.example']);
  assert.equal(errorCalls.length, 0);
  assert.equal(emitted.length, 0);
  assert.equal(schedulerConfigCalls.length, 1);
  assert.equal(drainCalls.length, 1);
  assert.deepEqual(modeFetchCalls, [{ url: 'https://a.example', mode: 'playwright' }]);
  assert.deepEqual(classifiedOutcomes, ['blocked']);
  assert.deepEqual(schedulerConfigCalls[0], {
    concurrency: 7,
    perHostDelayMs: 222,
    maxRetries: 3,
    defaultConcurrency: 4,
    defaultPerHostDelayMs: 333,
    defaultMaxRetries: 2,
    retryWaitMs: 444,
  });
});

test('runFetcherStartPhase keeps current fetcher/mode when start succeeds', async () => {
  const fetcher = {
    async start() {
      return undefined;
    },
  };

  const result = await runFetcherStartPhase({
    fetcher,
    fetcherMode: 'playwright',
    config: { dryRun: false },
    logger: { warn() {}, info() {} },
    fetcherConfig: { id: 'cfg' },
    createHttpFetcherFn: () => {
      throw new Error('should not create fallback fetcher');
    },
  });

  assert.equal(result.fetcher, fetcher);
  assert.equal(result.fetcherMode, 'playwright');
  assert.equal(result.fetcherStartFallbackReason, null);
});

test('runFetcherStartPhase falls back to http fetcher when start fails outside dry-run/http mode', async () => {
  const logs = [];
  const primaryFetcher = {
    async start() {
      throw new Error('start_failed');
    },
  };
  const fallbackFetcher = {
    async start() {
      return undefined;
    },
  };

  const result = await runFetcherStartPhase({
    fetcher: primaryFetcher,
    fetcherMode: 'playwright',
    config: { dryRun: false },
    logger: {
      warn(eventName, payload) {
        logs.push({ level: 'warn', eventName, payload });
      },
      info(eventName, payload) {
        logs.push({ level: 'info', eventName, payload });
      },
    },
    fetcherConfig: { id: 'cfg' },
    createHttpFetcherFn: (configArg, loggerArg) => {
      assert.deepEqual(configArg, { id: 'cfg' });
      assert.ok(loggerArg);
      return fallbackFetcher;
    },
  });

  assert.equal(result.fetcher, fallbackFetcher);
  assert.equal(result.fetcherMode, 'http');
  assert.equal(result.fetcherStartFallbackReason, 'start_failed');
  assert.deepEqual(logs, [
    {
      level: 'warn',
      eventName: 'fetcher_start_failed',
      payload: { fetcher_mode: 'playwright', message: 'start_failed' },
    },
    {
      level: 'info',
      eventName: 'fetcher_fallback_enabled',
      payload: { fetcher_mode: 'http' },
    },
  ]);
});

test('runFetcherStartPhase rethrows startup failure in dry-run mode', async () => {
  const expectedError = new Error('dry_run_start_failed');
  const primaryFetcher = {
    async start() {
      throw expectedError;
    },
  };
  let fallbackCreated = false;

  await assert.rejects(
    runFetcherStartPhase({
      fetcher: primaryFetcher,
      fetcherMode: 'playwright',
      config: { dryRun: true },
      logger: { warn() {}, info() {} },
      fetcherConfig: { id: 'cfg' },
      createHttpFetcherFn: () => {
        fallbackCreated = true;
        return { async start() {} };
      },
    }),
    expectedError,
  );
  assert.equal(fallbackCreated, false);
});

test('createRunLoggerBootstrap wires EventLogger options and deterministic start timestamp', () => {
  const createdOptions = [];
  const loggerMarker = { info() {} };
  const result = createRunLoggerBootstrap({
    storage: { marker: 'storage' },
    config: {
      runtimeEventsKey: '_runtime/custom-events.jsonl',
      onRuntimeEvent: () => {},
    },
    runId: 'run.abc123',
    nowFn: () => 1234567890,
    createEventLoggerFn: (options) => {
      createdOptions.push(options);
      return loggerMarker;
    },
  });

  assert.equal(createdOptions.length, 1);
  assert.equal(createdOptions[0].runtimeEventsKey, '_runtime/custom-events.jsonl');
  assert.equal(createdOptions[0].storage.marker, 'storage');
  assert.equal(typeof createdOptions[0].onEvent, 'function');
  assert.deepEqual(createdOptions[0].context, { runId: 'run.abc123' });
  assert.equal(result.logger, loggerMarker);
  assert.equal(result.startMs, 1234567890);
});

test('buildRunBootstrapLogPayload builds stable run_started and run_context payloads', () => {
  const payloads = buildRunBootstrapLogPayload({
    s3Key: 'specs/inputs/mouse/products/sample.json',
    runId: 'run.abc123',
    roundContext: { round: 2 },
    category: 'mouse',
    productId: 'mouse-sample',
    config: { runProfile: 'thorough' },
    runtimeMode: 'fast',
    identityFingerprint: 'identity-fingerprint-123',
    identityLockStatus: 'locked',
    identityLock: {
      family_model_count: 4,
      ambiguity_level: 'high',
    },
    dedupeMode: 'serp_url+content_hash',
  });

  assert.deepEqual(payloads.runStartedPayload, {
    s3Key: 'specs/inputs/mouse/products/sample.json',
    runId: 'run.abc123',
    round: 2,
  });
  assert.deepEqual(payloads.loggerContext, {
    category: 'mouse',
    productId: 'mouse-sample',
  });
  assert.equal(payloads.runContextPayload.run_profile, 'standard');
  assert.equal(payloads.runContextPayload.runtime_mode, 'fast');
  assert.equal(payloads.runContextPayload.identity_fingerprint, 'identity-fingerprint-123');
  assert.equal(payloads.runContextPayload.identity_lock_status, 'locked');
  assert.equal(payloads.runContextPayload.family_model_count, 4);
  assert.equal(payloads.runContextPayload.ambiguity_level, 'high');
  assert.equal(payloads.runContextPayload.dedupe_mode, 'serp_url+content_hash');
  assert.equal(payloads.runContextPayload.phase_cursor, 'phase_00_bootstrap');
});

const INDEXING_ORCHESTRATION_ENTRY = path.resolve('src/features/indexing/orchestration/index.js');

test('createModeAwareFetcherRegistry reuses the initial fetcher, lazy-starts mode fetchers, and stops each started fetcher once', async () => {
  const feature = await import(pathToFileURL(INDEXING_ORCHESTRATION_ENTRY).href);
  const createCalls = [];
  const startCalls = [];
  const stopCalls = [];
  const fetchCalls = [];

  const initialFetcher = {
    async fetch(source) {
      fetchCalls.push({ mode: 'crawlee', url: source.url });
      return { ok: true, source: 'crawlee' };
    },
    async stop() {
      stopCalls.push('crawlee');
    },
  };

  const registry = feature.createModeAwareFetcherRegistry({
    initialFetcher,
    initialMode: 'crawlee',
    createFetcherForModeFn: (mode) => {
      createCalls.push(mode);
      return {
        async start() {
          startCalls.push(mode);
        },
        async fetch(source) {
          fetchCalls.push({ mode, url: source.url });
          return { ok: true, source: mode };
        },
        async stop() {
          stopCalls.push(mode);
        },
      };
    },
  });

  const crawleeResult = await registry.fetchWithMode({ url: 'https://example.com/a' }, 'crawlee');
  const playwrightResult = await registry.fetchWithMode({ url: 'https://example.com/b' }, 'playwright');
  const playwrightRepeatResult = await registry.fetchWithMode({ url: 'https://example.com/c' }, 'playwright');
  const httpResult = await registry.fetchWithMode({ url: 'https://example.com/d' }, 'http');

  await registry.stopAll();

  assert.deepEqual(crawleeResult, { ok: true, source: 'crawlee' });
  assert.deepEqual(playwrightResult, { ok: true, source: 'playwright' });
  assert.deepEqual(playwrightRepeatResult, { ok: true, source: 'playwright' });
  assert.deepEqual(httpResult, { ok: true, source: 'http' });
  assert.deepEqual(createCalls, ['playwright', 'http']);
  assert.deepEqual(startCalls, ['playwright', 'http']);
  assert.deepEqual(fetchCalls, [
    { mode: 'crawlee', url: 'https://example.com/a' },
    { mode: 'playwright', url: 'https://example.com/b' },
    { mode: 'playwright', url: 'https://example.com/c' },
    { mode: 'http', url: 'https://example.com/d' },
  ]);
  assert.deepEqual(stopCalls, ['crawlee', 'playwright', 'http']);
});

test('createModeAwareFetcherRegistry falls back to the initial mode when the requested mode is empty', async () => {
  const feature = await import(pathToFileURL(INDEXING_ORCHESTRATION_ENTRY).href);
  const fetchCalls = [];

  const registry = feature.createModeAwareFetcherRegistry({
    initialFetcher: {
      async fetch(source) {
        fetchCalls.push(source.url);
        return { ok: true, source: 'initial' };
      },
      async stop() {},
    },
    initialMode: 'http',
    createFetcherForModeFn: () => {
      throw new Error('should not create alternate fetcher');
    },
  });

  const result = await registry.fetchWithMode({ url: 'https://example.com/initial' }, '');

  assert.deepEqual(result, { ok: true, source: 'initial' });
  assert.deepEqual(fetchCalls, ['https://example.com/initial']);
});

test('createModeAwareFetcherRegistry throws when an alternate mode cannot be created', async () => {
  const feature = await import(pathToFileURL(INDEXING_ORCHESTRATION_ENTRY).href);

  const registry = feature.createModeAwareFetcherRegistry({
    initialFetcher: {
      async fetch() {
        return { ok: true };
      },
      async stop() {},
    },
    initialMode: 'http',
    createFetcherForModeFn: () => null,
  });

  await assert.rejects(
    registry.fetchWithMode({ url: 'https://example.com/missing' }, 'playwright'),
    /unsupported fetcher mode/i,
  );
});

test('createPlannerBootstrap wires planner dependencies and applies runtime overrides', async () => {
  const calls = {
    createAdapterManager: 0,
    loadSourceIntel: 0,
    createPlanner: 0,
    syncRuntimeOverrides: 0,
    applyRuntimeOverrides: 0,
  };
  const adapterManager = { marker: 'adapter-manager' };
  const planner = { marker: 'planner' };
  const runtimeOverrides = { force_high_fields: ['dpi'] };

  const result = await createPlannerBootstrap({
    storage: { marker: 'storage' },
    config: { marker: 'config' },
    logger: { marker: 'logger' },
    category: 'mouse',
    job: { productId: 'mouse-sample' },
    categoryConfig: { fieldOrder: ['dpi'] },
    requiredFields: ['dpi'],
    createAdapterManagerFn: (config, logger) => {
      calls.createAdapterManager += 1;
      assert.equal(config.marker, 'config');
      assert.equal(logger.marker, 'logger');
      return adapterManager;
    },
    loadSourceIntelFn: async ({ storage, config, category }) => {
      calls.loadSourceIntel += 1;
      assert.equal(storage.marker, 'storage');
      assert.equal(config.marker, 'config');
      assert.equal(category, 'mouse');
      return { data: { domains: { 'example.com': {} } } };
    },
    createSourcePlannerFn: (job, config, categoryConfig, options) => {
      calls.createPlanner += 1;
      assert.equal(job.productId, 'mouse-sample');
      assert.equal(config.marker, 'config');
      assert.deepEqual(categoryConfig, { fieldOrder: ['dpi'] });
      assert.deepEqual(options.requiredFields, ['dpi']);
      assert.deepEqual(options.sourceIntel, { domains: { 'example.com': {} } });
      return planner;
    },
    syncRuntimeOverridesFn: async ({ force } = {}) => {
      calls.syncRuntimeOverrides += 1;
      assert.equal(force, true);
      return runtimeOverrides;
    },
    applyRuntimeOverridesToPlannerFn: (plannerArg, runtimeOverridesArg) => {
      calls.applyRuntimeOverrides += 1;
      assert.equal(plannerArg, planner);
      assert.equal(runtimeOverridesArg, runtimeOverrides);
    },
  });

  assert.equal(calls.createAdapterManager, 1);
  assert.equal(calls.loadSourceIntel, 1);
  assert.equal(calls.createPlanner, 1);
  assert.equal(calls.syncRuntimeOverrides, 1);
  assert.equal(calls.applyRuntimeOverrides, 1);
  assert.equal(result.adapterManager, adapterManager);
  assert.deepEqual(result.sourceIntel, { data: { domains: { 'example.com': {} } } });
  assert.equal(result.planner, planner);
  assert.equal(result.runtimeOverrides, runtimeOverrides);
});

test('createPlannerQueueRuntime builds planner queue dispatch input from static context and current state', () => {
  const executionContextCalls = [];
  const runtimeOverrides = { blocked_domains: ['example.com'] };
  const plannerQueueRuntime = createPlannerQueueRuntime({
    context: {
      config: { maxRunSeconds: 25 },
      planner: { hasNext: () => false },
      fetcherMode: 'crawlee',
      startMs: 1234,
      logger: { info: () => {} },
      runtimeOverrides,
      createFetchScheduler: () => ({}),
    },
    buildProcessPlannerQueueExecutionContextsFn: (input) => {
      executionContextCalls.push(input);
      return {
        sourcePreflightDispatchContext: { phase: 'preflight' },
        sourceFetchProcessingDispatchContext: { phase: 'fetch-processing' },
        sourceSkipDispatchContext: { phase: 'skip' },
      };
    },
  });

  const dispatchInput = plannerQueueRuntime.buildPlannerQueueDispatchInput({
    state: {
      runtimePauseAnnounced: true,
      fetchWorkerSeq: 3,
      artifactSequence: 9,
      runtimeOverrides: { blocked_domains: ['override.example.com'] },
    },
  });

  assert.deepEqual(plannerQueueRuntime.getRuntimeOverrides(), runtimeOverrides);
  assert.equal(executionContextCalls.length, 1);
  assert.deepEqual(executionContextCalls[0].runtimeOverrides, {
    blocked_domains: ['override.example.com'],
  });
  assert.equal(dispatchInput.initialMode, 'crawlee');
  assert.equal(dispatchInput.startMs, 1234);
  assert.equal(dispatchInput.runtimePauseAnnounced, true);
  assert.equal(dispatchInput.fetchWorkerSeq, 3);
  assert.equal(dispatchInput.artifactSequence, 9);
  assert.deepEqual(dispatchInput.sourcePreflightDispatchContext, { phase: 'preflight' });
  assert.deepEqual(dispatchInput.sourceFetchProcessingDispatchContext, { phase: 'fetch-processing' });
  assert.deepEqual(dispatchInput.sourceSkipDispatchContext, { phase: 'skip' });
});

test('runProcessPlannerQueuePhase can delegate through plannerQueueRuntime instead of raw context wiring', async () => {
  const observedStates = [];
  const observedDispatchInputs = [];

  const result = await runProcessPlannerQueuePhase({
    initialState: {
      runtimePauseAnnounced: false,
      artifactSequence: 12,
      phase08FieldContexts: ['field-a'],
      phase08PrimeRows: ['prime-a'],
      llmSourcesUsed: ['source-a'],
      llmCandidatesAccepted: ['candidate-a'],
    },
    plannerQueueRuntime: {
      getRuntimeOverrides: () => ({ blocked_domains: ['runtime.example.com'] }),
      buildPlannerQueueDispatchInput: ({ state }) => {
        observedStates.push(state);
        return {
          initialMode: 'http',
          dispatchToken: 'planner-runtime',
        };
      },
    },
    runPlannerQueueDispatchPhaseFn: async (input) => {
      observedDispatchInputs.push(input);
      return {
        runtimePauseAnnounced: true,
        fetchWorkerSeq: 4,
        artifactSequence: 13,
        terminalReason: 'max_run_seconds_reached',
      };
    },
  });

  assert.deepEqual(observedStates, [{
    runtimePauseAnnounced: false,
    fetchWorkerSeq: 0,
    artifactSequence: 12,
    runtimeOverrides: { blocked_domains: ['runtime.example.com'] },
  }]);
  assert.deepEqual(observedDispatchInputs, [{
    initialMode: 'http',
    dispatchToken: 'planner-runtime',
  }]);
  assert.equal(result.runtimePauseAnnounced, true);
  assert.equal(result.fetchWorkerSeq, 4);
  assert.equal(result.artifactSequence, 13);
  assert.equal(result.terminalReason, 'max_run_seconds_reached');
  assert.deepEqual(result.phase08FieldContexts, ['field-a']);
  assert.deepEqual(result.phase08PrimeRows, ['prime-a']);
  assert.deepEqual(result.llmSourcesUsed, ['source-a']);
  assert.deepEqual(result.llmCandidatesAccepted, ['candidate-a']);
});

test('createProductCompletionRuntime builds analysis keys and run-completed payload from static context', () => {
  const calls = [];
  const runtime = createProductCompletionRuntime({
    context: {
      storage: { id: 'storage' },
      category: 'mouse',
      productId: 'product-1',
      runBase: 'runs/base',
      summary: { runId: 'run-1' },
      config: { raw: true },
      runtimeMode: 'aggressive',
      identityFingerprint: 'brand:model',
      identityLockStatus: 'locked',
      dedupeMode: 'strict',
      confidence: 0.91,
      llmCandidatesAccepted: 3,
      llmCallCount: 4,
      llmCostUsd: 0.12,
      contribution: { llmFields: ['weight_g'] },
      llmEstimatedUsageCount: 5,
      llmRetryWithoutSchemaCount: 1,
      indexingHelperFlowEnabled: true,
      helperContext: { active: true },
      helperFilledFields: ['weight_g'],
      componentPriorFilledFields: ['shape'],
      criticDecisions: { accept: [] },
      llmValidatorDecisions: { enabled: false },
      phase08Extraction: { summary: { batch_count: 1 } },
      trafficLight: { green: ['shape'] },
      resumeMode: 'resume',
      resumeMaxAgeHours: 24,
      resumeReextractEnabled: true,
      resumeReextractAfterHours: 48,
      resumeSeededPendingCount: 2,
      resumeSeededLlmRetryCount: 1,
      resumeSeededReextractCount: 1,
      resumePersistedPendingCount: 3,
      resumePersistedLlmRetryCount: 2,
      resumePersistedSuccessCount: 4,
      hypothesisFollowupRoundsExecuted: 2,
      hypothesisFollowupSeededUrls: ['https://seed.example.com'],
      aggressiveExtraction: { enabled: false },
      durationMs: 1234,
      logger: { id: 'logger' },
      runId: 'run-1',
      needSet: { needs: [] },
      phase07PrimeSources: { summary: { refs_selected_total: 2 } },
      categoryConfig: { category: 'mouse' },
      sourceResults: [{ url: 'https://example.com/spec' }],
      normalized: { fields: { weight_g: '59' } },
      provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
      startMs: 10,
    },
    buildAnalysisArtifactKeyPhaseContextFn: (payload) => {
      calls.push(['buildAnalysisArtifactKeyPhaseContextFn', payload]);
      return { analysisKeyPhaseContext: payload };
    },
    buildAnalysisArtifactKeyContextFn: (payload) => {
      calls.push(['buildAnalysisArtifactKeyContextFn', payload]);
      return {
        needSetRunKey: 'needset/run',
        needSetLatestKey: 'needset/latest',
        phase07RunKey: 'phase07/run',
        phase07LatestKey: 'phase07/latest',
        phase08RunKey: 'phase08/run',
        phase08LatestKey: 'phase08/latest',
        sourcePacketsRunKey: 'sources/run',
        sourcePacketsLatestKey: 'sources/latest',
        itemPacketRunKey: 'item/run',
        itemPacketLatestKey: 'item/latest',
        runMetaPacketRunKey: 'meta/run',
        runMetaPacketLatestKey: 'meta/latest',
      };
    },
    buildRunCompletedPayloadPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildRunCompletedPayloadPhaseCallsiteContextFn', payload]);
      return { runCompletedPayloadCallsite: payload };
    },
    buildRunCompletedPayloadContextFn: (payload) => {
      calls.push(['buildRunCompletedPayloadContextFn', payload]);
      return { runCompletedPayloadContext: payload };
    },
    buildRunCompletedPayloadFn: (payload) => {
      calls.push(['buildRunCompletedPayloadFn', payload]);
      return { event: 'run.completed', runId: 'run-1' };
    },
  });

  const keys = runtime.resolveAnalysisArtifactKeys();
  const runCompletedPayload = runtime.buildRunCompletedPayload();

  assert.deepEqual(keys, {
    needSetRunKey: 'needset/run',
    needSetLatestKey: 'needset/latest',
    phase07RunKey: 'phase07/run',
    phase07LatestKey: 'phase07/latest',
    phase08RunKey: 'phase08/run',
    phase08LatestKey: 'phase08/latest',
    sourcePacketsRunKey: 'sources/run',
    sourcePacketsLatestKey: 'sources/latest',
    itemPacketRunKey: 'item/run',
    itemPacketLatestKey: 'item/latest',
    runMetaPacketRunKey: 'meta/run',
    runMetaPacketLatestKey: 'meta/latest',
  });
  assert.deepEqual(runCompletedPayload, { event: 'run.completed', runId: 'run-1' });
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'buildAnalysisArtifactKeyPhaseContextFn',
      'buildAnalysisArtifactKeyContextFn',
      'buildRunCompletedPayloadPhaseCallsiteContextFn',
      'buildRunCompletedPayloadContextFn',
      'buildRunCompletedPayloadFn',
    ],
  );
});

test('runProductCompletionLifecycle can delegate through completionRuntime instead of raw collaborator wiring', async () => {
  const calls = [];
  const runtimeKeys = {
    needSetRunKey: 'needset/run',
    needSetLatestKey: 'needset/latest',
    phase07RunKey: 'phase07/run',
    phase07LatestKey: 'phase07/latest',
    phase08RunKey: 'phase08/run',
    phase08LatestKey: 'phase08/latest',
    sourcePacketsRunKey: 'sources/run',
    sourcePacketsLatestKey: 'sources/latest',
    itemPacketRunKey: 'item/run',
    itemPacketLatestKey: 'item/latest',
    runMetaPacketRunKey: 'meta/run',
    runMetaPacketLatestKey: 'meta/latest',
  };
  const runCompletedPayload = { event: 'run.completed', runId: 'run-1' };
  const runResultPayload = { ok: true };

  const result = await runProductCompletionLifecycle({
    completionRuntime: {
      applyResearchArtifacts: async () => {
        calls.push('applyResearchArtifacts');
      },
      resolveAnalysisArtifactKeys: () => {
        calls.push('resolveAnalysisArtifactKeys');
        return runtimeKeys;
      },
      runIndexingSchemaArtifacts: async ({ keys }) => {
        calls.push(['runIndexingSchemaArtifacts', keys]);
        return { indexingSchemaPackets: { packets: ['schema'] } };
      },
      emitFinalizationTelemetry: ({ keys, indexingSchemaPackets }) => {
        calls.push(['emitFinalizationTelemetry', { keys, indexingSchemaPackets }]);
      },
      buildRunCompletedPayload: () => {
        calls.push('buildRunCompletedPayload');
        return runCompletedPayload;
      },
      emitRunCompletedEvent: ({ runCompletedPayload: payload }) => {
        calls.push(['emitRunCompletedEvent', payload]);
      },
      buildSummaryArtifacts: async () => {
        calls.push('buildSummaryArtifacts');
        return { rowTsv: 'row-tsv', markdownSummary: '# summary' };
      },
      persistIdentityReport: async () => {
        calls.push('persistIdentityReport');
      },
      runSourceIntelFinalization: async () => {
        calls.push('runSourceIntelFinalization');
      },
      runPostLearningUpdates: async () => {
        calls.push('runPostLearningUpdates');
        return { categoryBrain: { updated: true } };
      },
      runLearningGate: () => {
        calls.push('runLearningGate');
        return { learningAllowed: true };
      },
      persistSelfImproveLearningStores: async ({ learningGateResult }) => {
        calls.push(['persistSelfImproveLearningStores', learningGateResult]);
      },
      buildLearningExportPhaseContext: ({ rowTsv, markdownSummary }) => {
        calls.push(['buildLearningExportPhaseContext', { rowTsv, markdownSummary }]);
        return { phase: 'learning-export' };
      },
      runTerminalLearningExportLifecycle: async ({ learningExportPhaseContext }) => {
        calls.push(['runTerminalLearningExportLifecycle', learningExportPhaseContext]);
        return {
          exportInfo: { key: 'export' },
          finalExport: { key: 'final' },
          learning: { key: 'learning' },
        };
      },
      buildRunResultPayload: ({
        exportInfo,
        finalExport,
        learning,
        learningGateResult,
        categoryBrain,
      }) => {
        calls.push([
          'buildRunResultPayload',
          { exportInfo, finalExport, learning, learningGateResult, categoryBrain },
        ]);
        return runResultPayload;
      },
    },
  });

  assert.equal(result, runResultPayload);
  assert.deepEqual(calls, [
    'applyResearchArtifacts',
    'resolveAnalysisArtifactKeys',
    ['runIndexingSchemaArtifacts', runtimeKeys],
    ['emitFinalizationTelemetry', { keys: runtimeKeys, indexingSchemaPackets: { packets: ['schema'] } }],
    'buildRunCompletedPayload',
    ['emitRunCompletedEvent', runCompletedPayload],
    'buildSummaryArtifacts',
    'persistIdentityReport',
    'runSourceIntelFinalization',
    'runPostLearningUpdates',
    'runLearningGate',
    ['persistSelfImproveLearningStores', { learningAllowed: true }],
    ['buildLearningExportPhaseContext', { rowTsv: 'row-tsv', markdownSummary: '# summary' }],
    ['runTerminalLearningExportLifecycle', { phase: 'learning-export' }],
    ['buildRunResultPayload', {
      exportInfo: { key: 'export' },
      finalExport: { key: 'final' },
      learning: { key: 'learning' },
      learningGateResult: { learningAllowed: true },
      categoryBrain: { updated: true },
    }],
  ]);
});

test('createProductFinalizationDerivationRuntime builds derivation phases from static context', async () => {
  const calls = [];
  const computeCompletenessRequiredFn = (payload) => payload;
  const computeCoverageOverallFn = (payload) => payload;
  const computeConfidenceFn = (payload) => payload;
  const evaluateValidationGateFn = (payload) => payload;

  const runtime = createProductFinalizationDerivationRuntime({
    context: {
      adapterManager: { id: 'adapter-manager' },
      job: { id: 'job-1' },
      runId: 'run-1',
      storage: { id: 'storage' },
      helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
      adapterArtifacts: { adapter: true },
      sourceResults: [{ url: 'https://example.com/spec' }],
      anchors: { shape: 'symmetrical' },
      config: {},
      productId: 'product-1',
      categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
      fieldOrder: ['shape', 'weight_g'],
      category: 'mouse',
      runtimeFieldRulesEngine: { version: 'v1' },
      requiredFields: ['shape'],
      targets: { targetCompleteness: 0.9 },
      logger: { id: 'logger' },
    },
    buildDedicatedSyntheticSourceIngestionContextFn: (payload) => {
      calls.push(['buildDedicatedSyntheticSourceIngestionContextFn', payload]);
      return { ingestionContext: payload };
    },
    runDedicatedSyntheticSourceIngestionPhaseFn: async (payload) => {
      calls.push(['runDedicatedSyntheticSourceIngestionPhaseFn', payload]);
    },
    buildIdentityConsensusPhaseCallsiteContextFn: (payload) => {
      calls.push(['buildIdentityConsensusPhaseCallsiteContextFn', payload]);
      return { identityConsensusPhaseCallsite: payload };
    },
    buildIdentityConsensusContextFn: (payload) => {
      calls.push(['buildIdentityConsensusContextFn', payload]);
      return {
        identityGate: { validated: true },
        identityConfidence: 0.92,
        identityReport: { status: 'ok' },
        identity: { brand: 'Logitech' },
        sourceSummary: { sources: 1 },
        allAnchorConflicts: [],
        anchorMajorConflictsCount: 0,
        consensus: { agreementScore: 0.88 },
      };
    },
    buildValidationGatePhaseCallsiteContextFn: (payload) => {
      calls.push(['buildValidationGatePhaseCallsiteContextFn', payload]);
      assert.equal(payload.computeCompletenessRequiredFn, computeCompletenessRequiredFn);
      assert.equal(payload.computeCoverageOverallFn, computeCoverageOverallFn);
      assert.equal(payload.computeConfidenceFn, computeConfidenceFn);
      assert.equal(payload.evaluateValidationGateFn, evaluateValidationGateFn);
      return { validationGatePhaseCallsite: payload };
    },
    buildValidationGateContextFn: (payload) => {
      calls.push(['buildValidationGateContextFn', payload]);
      return {
        completenessStats: { completenessRequired: 0.9 },
        coverageStats: { coverageOverall: 0.84 },
        confidence: 0.91,
        gate: { validated: true, validatedReason: 'validated' },
        publishable: true,
        publishBlockers: [],
      };
    },
  });

  await runtime.runDedicatedSyntheticSourceIngestion();
  const identityConsensus = runtime.buildIdentityConsensus();
  const validationGate = runtime.buildValidationGate({
    normalized: { fields: { weight_g: '59' } },
    provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
    allAnchorConflicts: [],
    consensus: identityConsensus.consensus,
    identityGate: identityConsensus.identityGate,
    identityConfidence: identityConsensus.identityConfidence,
    criticalFieldsBelowPassTarget: [],
    identityFull: false,
    identityPublishThreshold: 0.8,
    computeCompletenessRequiredFn,
    computeCoverageOverallFn,
    computeConfidenceFn,
    evaluateValidationGateFn,
  });
  assert.deepEqual(identityConsensus.identity, { brand: 'Logitech' });
  assert.deepEqual(validationGate.gate, { validated: true, validatedReason: 'validated' });
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'buildDedicatedSyntheticSourceIngestionContextFn',
      'runDedicatedSyntheticSourceIngestionPhaseFn',
      'buildIdentityConsensusPhaseCallsiteContextFn',
      'buildIdentityConsensusContextFn',
      'buildValidationGatePhaseCallsiteContextFn',
      'buildValidationGateContextFn',
    ],
  );
});

test('runProductFinalizationDerivation can delegate through finalizationDerivationRuntime instead of raw collaborator wiring', async () => {
  const calls = [];

  const result = await runProductFinalizationDerivation({
    config: {
      llmWriteSummary: true,
    },
    terminalReason: '',
    startMs: 500,
    nowFn: () => 2000,
    categoryConfig: { criticalFieldSet: new Set(['weight_g']) },
    fieldOrder: ['shape', 'weight_g'],
    llmValidatorDecisions: { seeded: true },
    buildSearchPlanningContextFn: () => ({}),
    buildSearchPlanFn: async () => null,
    finalizationDerivationRuntime: {
      runDedicatedSyntheticSourceIngestion: async () => {
        calls.push('runDedicatedSyntheticSourceIngestion');
      },
      buildIdentityConsensus: () => {
        calls.push('buildIdentityConsensus');
        return {
          identityGate: { validated: true },
          identityConfidence: 0.92,
          identityReport: { status: 'ok' },
          identity: { brand: 'Logitech' },
          sourceSummary: { sources: 1 },
          allAnchorConflicts: [{ severity: 'MAJOR' }],
          anchorMajorConflictsCount: 1,
          consensus: { agreementScore: 0.87 },
        };
      },
      buildIdentityNormalization: ({
        identityConfidence,
        identity,
        sourceSummary,
        consensus,
      }) => {
        calls.push([
          'buildIdentityNormalization',
          { identityConfidence, identity, sourceSummary, consensus },
        ]);
        return {
          identityPublishThreshold: 0.8,
          identityProvisional: true,
          identityFull: false,
          normalized: { fields: { weight_g: '60' }, quality: {} },
          provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
          candidates: [{ field: 'weight_g' }],
          fieldsBelowPassTarget: ['weight_g'],
          criticalFieldsBelowPassTarget: ['weight_g'],
          newValuesProposed: [{ field: 'weight_g', value: '60' }],
        };
      },
      runComponentPrior: async ({
        identityGate,
        normalized,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      }) => {
        calls.push([
          'runComponentPrior',
          { identityGate, normalized, fieldsBelowPassTarget, criticalFieldsBelowPassTarget },
        ]);
        return {
          componentPriorFilledFields: ['shape'],
          componentPriorMatches: ['shell'],
          fieldsBelowPassTarget: ['battery_life'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      runDeterministicCritic: ({
        normalized,
        provenance,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      }) => {
        calls.push([
          'runDeterministicCritic',
          { normalized, provenance, fieldsBelowPassTarget, criticalFieldsBelowPassTarget },
        ]);
        return {
          criticDecisions: { accept: [{ field: 'shape' }] },
          fieldsBelowPassTarget: ['polling_hz'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      runLlmValidator: async ({
        skipExpensiveFinalization,
        fieldsBelowPassTarget,
        identityProvisional,
        llmValidatorDecisions,
      }) => {
        calls.push([
          'runLlmValidator',
          {
            skipExpensiveFinalization,
            fieldsBelowPassTarget,
            identityProvisional,
            llmValidatorDecisions,
          },
        ]);
        return {
          llmValidatorDecisions: { enabled: true, accept: [{ field: 'shape' }] },
          fieldsBelowPassTarget: ['sensor'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      runInferencePolicy: ({
        normalized,
        provenance,
        fieldsBelowPassTarget,
        criticalFieldsBelowPassTarget,
      }) => {
        calls.push([
          'runInferencePolicy',
          { normalized, provenance, fieldsBelowPassTarget, criticalFieldsBelowPassTarget },
        ]);
        return {
          temporalEvidence: { hits: 2 },
          inferenceResult: { filled_fields: ['shape'] },
          fieldsBelowPassTarget: ['sensor'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      selectRuntimeEvidencePack: () => {
        calls.push('selectRuntimeEvidencePack');
        return { pack: true };
      },
      runAggressiveExtraction: async ({
        skipExpensiveFinalization,
        runtimeEvidencePack,
        fieldsBelowPassTarget,
      }) => {
        calls.push([
          'runAggressiveExtraction',
          { skipExpensiveFinalization, runtimeEvidencePack, fieldsBelowPassTarget },
        ]);
        return {
          aggressiveExtraction: { enabled: true },
          fieldsBelowPassTarget: ['dpi'],
          criticalFieldsBelowPassTarget: [],
        };
      },
      applyRuntimeGateAndCuration: async ({
        normalizedFields,
        runtimeEvidencePack,
        fieldsBelowPassTarget,
      }) => {
        calls.push([
          'applyRuntimeGateAndCuration',
          { normalizedFields, runtimeEvidencePack, fieldsBelowPassTarget },
        ]);
        return {
          runtimeGateResult: { failures: [] },
          normalizedFields: { weight_g: '59' },
          fieldsBelowPassTarget: ['weight_g'],
          criticalFieldsBelowPassTarget: [],
          curationSuggestionResult: { appended_count: 1 },
        };
      },
      buildValidationGate: ({
        normalized,
        allAnchorConflicts,
        identityGate,
        criticalFieldsBelowPassTarget,
      }) => {
        calls.push([
          'buildValidationGate',
          { normalized, allAnchorConflicts, identityGate, criticalFieldsBelowPassTarget },
        ]);
        return {
          completenessStats: { completenessRequired: 0.9 },
          coverageStats: { coverageOverall: 0.85 },
          confidence: 0.91,
          gate: { validated: true, validatedReason: 'validated' },
          publishable: true,
          publishBlockers: [],
        };
      },
      buildConstraintAnalysis: ({ runtimeGateResult, normalized }) => {
        calls.push(['buildConstraintAnalysis', { runtimeGateResult, normalized }]);
        return {
          manufacturerSources: [{ url: 'https://example.com/spec' }],
          manufacturerMajorConflicts: 0,
          endpointMining: { endpoint_count: 3 },
          constraintAnalysis: { conflicts: [] },
        };
      },
      buildNeedsetReasoning: ({
        constraintAnalysis,
        fieldsBelowPassTarget,
        publishable,
      }) => {
        calls.push([
          'buildNeedsetReasoning',
          { constraintAnalysis, fieldsBelowPassTarget, publishable },
        ]);
        return {
          hypothesisQueue: [{ field: 'weight_g' }],
          fieldReasoning: { weight_g: { reason: 'missing' } },
          trafficLight: { yellow: ['weight_g'] },
          extractionGateOpen: true,
          needSet: { needs: [{ field_key: 'weight_g' }] },
        };
      },
      buildPhase07PrimeSources: ({ needSet, provenance }) => {
        calls.push(['buildPhase07PrimeSources', { needSet, provenance }]);
        return {
          phase07PrimeSources: { summary: { refs_selected_total: 2 } },
        };
      },
      buildPhase08Extraction: ({ llmValidatorDecisions }) => {
        calls.push(['buildPhase08Extraction', { llmValidatorDecisions }]);
        return {
          phase08Extraction: { summary: { accepted_candidate_count: 3 } },
        };
      },
      buildFinalizationMetrics: ({ normalized, provenance }) => {
        calls.push(['buildFinalizationMetrics', { normalized, provenance }]);
        return {
          parserHealthRows: [{ score: 1 }],
          parserHealthAverage: 0.44,
          fingerprintCount: 7,
          contribution: { llmFields: ['shape'] },
        };
      },
    },
  });

  assert.deepEqual(result.normalized.fields, { weight_g: '59' });
  assert.deepEqual(result.criticDecisions, { accept: [{ field: 'shape' }] });
  assert.deepEqual(result.llmValidatorDecisions, { enabled: true, accept: [{ field: 'shape' }] });
  assert.deepEqual(result.runtimeEvidencePack, { pack: true });
  assert.deepEqual(result.phase07PrimeSources, { summary: { refs_selected_total: 2 } });
  assert.deepEqual(result.phase08Extraction, { summary: { accepted_candidate_count: 3 } });
  assert.equal(result.durationMs, 1500);
  assert.deepEqual(
    calls,
    [
      'runDedicatedSyntheticSourceIngestion',
      'buildIdentityConsensus',
      ['buildIdentityNormalization', {
        identityConfidence: 0.92,
        identity: { brand: 'Logitech' },
        sourceSummary: { sources: 1 },
        consensus: { agreementScore: 0.87 },
      }],
      ['runComponentPrior', {
        identityGate: { validated: true },
        normalized: { fields: { weight_g: '59' }, quality: {} },
        fieldsBelowPassTarget: ['weight_g'],
        criticalFieldsBelowPassTarget: ['weight_g'],
      }],
      ['runDeterministicCritic', {
        normalized: { fields: { weight_g: '59' }, quality: {} },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
        fieldsBelowPassTarget: ['battery_life'],
        criticalFieldsBelowPassTarget: [],
      }],
      ['runLlmValidator', {
        skipExpensiveFinalization: false,
        fieldsBelowPassTarget: ['polling_hz'],
        identityProvisional: true,
        llmValidatorDecisions: { seeded: true },
      }],
      ['runInferencePolicy', {
        normalized: { fields: { weight_g: '59' }, quality: {} },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
        fieldsBelowPassTarget: ['sensor'],
        criticalFieldsBelowPassTarget: [],
      }],
      'selectRuntimeEvidencePack',
      ['runAggressiveExtraction', {
        skipExpensiveFinalization: false,
        runtimeEvidencePack: { pack: true },
        fieldsBelowPassTarget: ['sensor'],
      }],
      ['applyRuntimeGateAndCuration', {
        normalizedFields: { weight_g: '60' },
        runtimeEvidencePack: { pack: true },
        fieldsBelowPassTarget: ['dpi'],
      }],
      ['buildValidationGate', {
        normalized: { fields: { weight_g: '59' }, quality: {} },
        allAnchorConflicts: [{ severity: 'MAJOR' }],
        identityGate: { validated: true },
        criticalFieldsBelowPassTarget: [],
      }],
      ['buildConstraintAnalysis', {
        runtimeGateResult: { failures: [] },
        normalized: { fields: { weight_g: '59' }, quality: {} },
      }],
      ['buildNeedsetReasoning', {
        constraintAnalysis: { conflicts: [] },
        fieldsBelowPassTarget: ['weight_g'],
        publishable: true,
      }],
      ['buildPhase07PrimeSources', {
        needSet: { needs: [{ field_key: 'weight_g' }] },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
      }],
      ['buildPhase08Extraction', {
        llmValidatorDecisions: { enabled: true, accept: [{ field: 'shape' }] },
      }],
      ['buildFinalizationMetrics', {
        normalized: { fields: { weight_g: '59' }, quality: {} },
        provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
      }],
    ],
  );
});

function createPipelineContext() {
  return {
    llmRuntime: {
      getUsageState: () => ({
        llmCallCount: 6,
        llmCostUsd: 0.12,
        llmEstimatedUsageCount: 4,
        llmRetryWithoutSchemaCount: 1,
      }),
    },
    productId: 'product-1',
    runId: 'run-1',
    category: 'mouse',
    config: { runProfile: 'thorough' },
    runtimeMode: 'aggressive',
    identityFingerprint: 'brand:model',
    identityLockStatus: 'locked',
    dedupeMode: 'strict',
    targets: { targetCompleteness: 0.9 },
    anchors: { shape: 'symmetrical' },
    discoveryResult: { enabled: true },
    indexingHelperFlowEnabled: true,
    helperContext: { active: true },
    helperSupportiveSyntheticSources: [{ url: 'helper://supportive/one' }],
    helperFilledFields: ['weight_g'],
    helperFilledByMethod: { supportive: 1 },
    helperMismatches: [{ field: 'dpi' }],
    llmTargetFields: ['shape'],
    goldenExamples: [{ id: 1 }],
    llmCandidatesAccepted: 3,
    llmSourcesUsed: 2,
    llmContext: { verification: { done: true } },
    categoryConfig: { category: 'mouse' },
    fetcherMode: 'playwright',
    fetcherStartFallbackReason: null,
    indexingResumeKey: 'resume/key',
    resumeMode: 'resume',
    resumeMaxAgeHours: 24,
    previousResumeStateAgeHours: 2,
    resumeReextractEnabled: true,
    resumeReextractAfterHours: 48,
    resumeSeededPendingCount: 1,
    resumeSeededLlmRetryCount: 2,
    resumeSeededReextractCount: 3,
    resumePersistedPendingCount: 4,
    resumePersistedLlmRetryCount: 5,
    resumePersistedSuccessCount: 6,
    plannerStats: { pending: 2 },
    hypothesisFollowupRoundsExecuted: 1,
    hypothesisFollowupSeededUrls: ['https://seed.example.com'],
    roundContext: { round: 2 },
    storage: { id: 'storage' },
    runArtifactsBase: 'runs/base',
    sourceResults: [{ url: 'https://example.com/spec' }],
    logger: { id: 'logger' },
    fieldOrder: ['shape', 'weight_g'],
    sourceIntelBrand: 'Logitech',
    job: { id: 'job-1' },
    artifactsByHost: { 'example.com': {} },
    adapterArtifacts: { adapter: true },
    frontierDb: { id: 'frontier-db' },
    fieldReasoning: { shape: { reason: 'anchored' } },
  };
}

test('createProductFinalizationPipelineRuntime builds frozen derivation, summary, and completion contracts', () => {
  const runtime = createProductFinalizationPipelineRuntime({
    context: createPipelineContext(),
  });

  assert.ok(Object.isFrozen(runtime.contracts));
  assert.ok(Object.isFrozen(runtime.contracts.derivation));
  assert.ok(Object.isFrozen(runtime.contracts.summary));
  assert.ok(Object.isFrozen(runtime.contracts.completion));
  assert.equal(runtime.contracts.derivation.runId, 'run-1');
  assert.equal(runtime.contracts.summary.runId, 'run-1');
  assert.equal(runtime.contracts.completion.runId, 'run-1');
  assert.equal(runtime.contracts.completion.runArtifactsBase, 'runs/base');
});

test('createProductFinalizationPipelineRuntime derives, summarizes, and completes from shared context', async () => {
  const calls = [];
  const derivation = {
    identityGate: { validated: true },
    identityConfidence: 0.92,
    identityReport: { status: 'ok' },
    identity: { brand: 'Logitech' },
    allAnchorConflicts: [{ severity: 'MAJOR' }],
    anchorMajorConflictsCount: 1,
    normalized: { fields: { weight_g: '59' } },
    provenance: { weight_g: [{ url: 'https://example.com/spec' }] },
    candidates: [{ field: 'weight_g' }],
    fieldsBelowPassTarget: ['weight_g'],
    criticalFieldsBelowPassTarget: [],
    newValuesProposed: [{ field: 'weight_g', value: '59' }],
    constrainedFinalizationConfig: {},
    componentPriorFilledFields: ['shape'],
    componentPriorMatches: ['shell'],
    criticDecisions: { accept: [{ field: 'shape' }] },
    llmValidatorDecisions: { enabled: true, accept: [{ field: 'shape' }] },
    temporalEvidence: { hits: 1 },
    inferenceResult: { filled_fields: ['shape'] },
    runtimeEvidencePack: { pack: true },
    aggressiveExtraction: { enabled: false },
    runtimeGateResult: { failures: [] },
    curationSuggestionResult: { appended_count: 1 },
    completenessStats: { completenessRequired: 0.9 },
    coverageStats: { coverageOverall: 0.84 },
    confidence: 0.91,
    gate: { validated: true, validatedReason: 'validated' },
    publishable: true,
    publishBlockers: [],
    durationMs: 1234,
    validatedReason: 'validated',
    manufacturerSources: [{ url: 'https://example.com/spec' }],
    manufacturerMajorConflicts: 0,
    endpointMining: { endpoint_count: 3 },
    constraintAnalysis: { conflicts: [] },
    hypothesisQueue: [{ field: 'shape' }],
    fieldReasoning: { shape: { reason: 'anchored' } },
    trafficLight: { green: ['shape'] },
    extractionGateOpen: true,
    needSet: { needs: [{ field_key: 'shape' }] },
    phase07PrimeSources: { summary: { refs_selected_total: 2 } },
    phase08Extraction: { summary: { accepted_candidate_count: 3 } },
    parserHealthRows: [{ score: 1 }],
    parserHealthAverage: 0.44,
    fingerprintCount: 7,
    contribution: { llmFields: ['shape'] },
  };
  const summaryBuildResult = {
    summary: { runId: 'run-1', validated: true },
    llmCallCount: 6,
    llmCostUsd: 0.12,
    llmEstimatedUsageCount: 4,
    llmRetryWithoutSchemaCount: 1,
  };
  const runResult = { ok: true };

  const runtime = createProductFinalizationPipelineRuntime({
    context: createPipelineContext(),
    runProductFinalizationDerivationFn: async (payload) => {
      calls.push(['runProductFinalizationDerivationFn', payload]);
      return derivation;
    },
    buildRunProductFinalizationSummaryFn: (payload) => {
      calls.push(['buildRunProductFinalizationSummaryFn', payload]);
      return summaryBuildResult;
    },
    runProductCompletionLifecycleFn: async (payload) => {
      calls.push(['runProductCompletionLifecycleFn', payload]);
      return runResult;
    },
  });

  const nextDerivation = await runtime.deriveFinalization();
  const nextSummaryBuildResult = runtime.buildSummary({ finalizationDerivation: nextDerivation });
  const result = await runtime.runCompletion({
    finalizationDerivation: nextDerivation,
    summaryBuildResult: nextSummaryBuildResult,
  });

  assert.equal(result, runResult);
  assert.equal(nextDerivation, derivation);
  assert.equal(nextSummaryBuildResult, summaryBuildResult);
  assert.equal(calls[0][1].runId, runtime.contracts.derivation.runId);
  assert.equal(calls[1][1].runId, runtime.contracts.summary.runId);
  assert.equal(calls[2][1].runArtifactsBase, runtime.contracts.completion.runArtifactsBase);
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'runProductFinalizationDerivationFn',
      'buildRunProductFinalizationSummaryFn',
      'runProductCompletionLifecycleFn',
    ],
  );
  assert.equal(calls[0][1].runId, 'run-1');
  assert.deepEqual(calls[0][1].llmValidatorDecisions, undefined);
  assert.equal(calls[1][1].llmRuntime.getUsageState().llmCallCount, 6);
  assert.deepEqual(calls[1][1].gate, { validated: true, validatedReason: 'validated' });
  assert.deepEqual(calls[1][1].plannerStats, { pending: 2 });
  assert.deepEqual(calls[2][1].summary, { runId: 'run-1', validated: true });
  assert.equal(calls[2][1].llmCallCount, 6);
  assert.deepEqual(calls[2][1].normalized, { fields: { weight_g: '59' } });
  assert.deepEqual(calls[2][1].needSet, { needs: [{ field_key: 'shape' }] });
});

test('runProductFinalizationPipeline can delegate through finalizationPipelineRuntime instead of raw collaborator wiring', async () => {
  const calls = [];
  const derivation = { gate: { validated: true } };
  const summaryBuildResult = { summary: { runId: 'run-1' }, llmCallCount: 1 };
  const runResult = { ok: true };

  const result = await runProductFinalizationPipeline({
    finalizationPipelineRuntime: {
      deriveFinalization: async () => {
        calls.push('deriveFinalization');
        return derivation;
      },
      buildSummary: ({ finalizationDerivation }) => {
        calls.push(['buildSummary', finalizationDerivation]);
        return summaryBuildResult;
      },
      runCompletion: async ({ finalizationDerivation, summaryBuildResult: nextSummaryBuildResult }) => {
        calls.push(['runCompletion', { finalizationDerivation, summaryBuildResult: nextSummaryBuildResult }]);
        return runResult;
      },
    },
  });

  assert.equal(result, runResult);
  assert.deepEqual(calls, [
    'deriveFinalization',
    ['buildSummary', derivation],
    ['runCompletion', { finalizationDerivation: derivation, summaryBuildResult }],
  ]);
});

test('createResearchBootstrap creates frontier and orchestrator', async () => {
  const createdFrontierOptions = [];
  const createdOrchestratorOptions = [];
  const loadCalls = [];
  const frontier = {
    async load() {
      loadCalls.push('load');
    },
  };

  const result = await createResearchBootstrap({
    storage: {
      resolveOutputKey(key) {
        return `resolved/${key}`;
      },
    },
    config: {
      frontierDbPath: 'custom/frontier.json',
      s3OutputPrefix: 'specs/outputs',
    },
    logger: { marker: 'logger' },
    createFrontierFn: (options) => {
      createdFrontierOptions.push(options);
      return frontier;
    },
    createUberAggressiveOrchestratorFn: (options) => {
      createdOrchestratorOptions.push(options);
      return { marker: 'orchestrator' };
    },
  });

  assert.equal(loadCalls.length, 1);
  assert.equal(createdFrontierOptions.length, 1);
  assert.equal(createdFrontierOptions[0].key, 'resolved/custom/frontier.json');
  assert.equal(createdFrontierOptions[0].storage.resolveOutputKey('x'), 'resolved/x');
  assert.equal(createdFrontierOptions[0].config._logger.marker, 'logger');
  assert.equal(createdOrchestratorOptions.length, 1);
  assert.equal(createdOrchestratorOptions[0].frontier, frontier);
  assert.equal(result.frontierDb, frontier);
  assert.equal(result.uberOrchestrator.marker, 'orchestrator');
});

test('createResearchBootstrap keeps already-prefixed frontier path without resolveOutputKey mutation', async () => {
  const createdFrontierOptions = [];
  const result = await createResearchBootstrap({
    storage: {
      resolveOutputKey() {
        throw new Error('resolveOutputKey should not be called for already-prefixed key');
      },
    },
    config: {
      frontierDbPath: 'specs/outputs/_intel/frontier/frontier.json',
      s3OutputPrefix: 'specs/outputs',
    },
    logger: { marker: 'logger' },
    createFrontierFn: (options) => {
      createdFrontierOptions.push(options);
      return { load: async () => {} };
    },
    createUberAggressiveOrchestratorFn: () => ({ marker: 'orchestrator' }),
  });

  assert.equal(createdFrontierOptions.length, 1);
  assert.equal(createdFrontierOptions[0].key, 'specs/outputs/_intel/frontier/frontier.json');
  assert.equal(result.frontierDb && typeof result.frontierDb.load, 'function');
});

test('createRunLlmRuntime initializes verification state and merged forced-high fields', () => {
  const runtime = createRunLlmRuntime({
    storage: { id: 'storage' },
    config: {
      llmVerifyMode: true,
      llmVerifySampleRate: 10,
    },
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run-123',
    roundContext: {
      round: 2,
      force_verify_llm: true,
      escalated_fields: ['weight_g', 'dpi'],
    },
    runtimeMode: 'production',
    traceWriter: { id: 'trace' },
    routeMatrixPolicy: { route: 'matrix' },
    runtimeOverrides: {
      force_high_fields: ['dpi', 'sensor'],
    },
    stableHashFn: () => 3,
    normalizeCostRatesFn: () => ({ extract: 0.42 }),
  });

  assert.deepEqual(runtime.llmCostRates, { extract: 0.42 });
  assert.equal(runtime.llmContext.round, 2);
  assert.equal(runtime.llmContext.mode, 'production');
  assert.deepEqual(runtime.llmContext.verification, {
    enabled: true,
    done: false,
    trigger: 'missing_required_fields',
  });
  assert.deepEqual(runtime.llmContext.forcedHighFields, ['dpi', 'sensor', 'weight_g']);
  assert.equal(runtime.llmContext.route_matrix_policy.route, 'matrix');
  assert.equal(runtime.llmContext.routeMatrixPolicy.route, 'matrix');
});

test('createRunLlmRuntime records usage counters, billing entries, and prompt index writes', async () => {
  const ledgerEntries = [];
  const promptResults = [];
  const mkdirCalls = [];

  const runtime = createRunLlmRuntime({
    storage: { id: 'storage' },
    config: {
      llmVerifyMode: false,
    },
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run-123',
    roundContext: {
      round: 0,
      escalated_fields: [],
    },
    runtimeMode: 'production',
    traceWriter: null,
    routeMatrixPolicy: {},
    runtimeOverrides: {},
    stableHashFn: () => 0,
    normalizeCostRatesFn: () => ({ extract: 0.2 }),
    appendCostLedgerEntryFn: async (payload) => {
      ledgerEntries.push(payload);
    },
    defaultIndexLabRootFn: () => 'C:/idx-root',
    joinPathFn: (...parts) => parts.join('/'),
    mkdirSyncFn: (dirPath, options) => {
      mkdirCalls.push({ dirPath, options });
    },
    recordPromptResultFn: (payload, filePath) => {
      promptResults.push({ payload, filePath });
    },
    nowIsoFn: () => '2026-03-11T12:00:00.000Z',
  });

  await runtime.llmContext.recordUsage({
    provider: 'openai',
    model: 'gpt-test',
    round: 3,
    prompt_tokens: 100,
    completion_tokens: 50,
    cached_prompt_tokens: 10,
    total_tokens: 160,
    cost_usd: 1.25,
    reason: 'extract',
    host: 'example.com',
    url_count: 2,
    evidence_chars: 400,
    estimated_usage: true,
    retry_without_schema: true,
    deepseek_mode_detected: false,
    json_schema_requested: true,
  });

  assert.deepEqual(runtime.getUsageState(), {
    llmCallCount: 1,
    llmCostUsd: 1.25,
    llmEstimatedUsageCount: 1,
    llmRetryWithoutSchemaCount: 1,
  });
  assert.deepEqual(ledgerEntries, [
    {
      storage: { id: 'storage' },
      config: { llmVerifyMode: false },
      entry: {
        ts: '2026-03-11T12:00:00.000Z',
        provider: 'openai',
        model: 'gpt-test',
        category: 'mouse',
        productId: 'mouse-product',
        runId: 'run-123',
        round: 3,
        prompt_tokens: 100,
        completion_tokens: 50,
        cached_prompt_tokens: 10,
        total_tokens: 160,
        cost_usd: 1.25,
        reason: 'extract',
        host: 'example.com',
        url_count: 2,
        evidence_chars: 400,
        estimated_usage: true,
        meta: {
          retry_without_schema: true,
          deepseek_mode_detected: false,
          json_schema_requested: true,
        },
      },
    },
  ]);
  assert.deepEqual(mkdirCalls, [
    {
      dirPath: 'C:/idx-root/mouse',
      options: { recursive: true },
    },
  ]);
  assert.deepEqual(promptResults, [
    {
      payload: {
        prompt_version: 'extract',
        prompt_hash: '',
        model: 'gpt-test',
        field_count: 0,
        token_count: 160,
        latency_ms: 0,
        success: true,
        run_id: 'run-123',
        category: 'mouse',
      },
      filePath: 'C:/idx-root/mouse/prompt-index.ndjson',
    },
  ]);
});

test('createRuntimeOverridesLoader resolves control key and caches reads within throttle window', async () => {
  let nowMs = 10_000;
  const readCalls = [];
  const storage = {
    async readJsonOrNull(key) {
      readCalls.push(key);
      return { disable_llm: true, force_high_fields: ['dpi'] };
    },
  };
  const loader = createRuntimeOverridesLoader({
    storage,
    config: {},
    nowFn: () => nowMs,
    readThrottleMs: 3000,
    resolveRuntimeControlKeyFn: () => '_runtime/runtime-control.json',
    defaultRuntimeOverridesFn: () => ({ pause: false, force_high_fields: [] }),
    normalizeRuntimeOverridesFn: (payload = {}) => ({
      pause: Boolean(payload.pause),
      disable_llm: Boolean(payload.disable_llm),
      force_high_fields: Array.isArray(payload.force_high_fields) ? payload.force_high_fields : [],
    }),
  });

  assert.equal(loader.runtimeControlKey, '_runtime/runtime-control.json');
  assert.deepEqual(loader.getRuntimeOverrides(), { pause: false, force_high_fields: [] });

  const first = await loader.loadRuntimeOverrides({ force: true });
  assert.equal(readCalls.length, 1);
  assert.equal(first.disable_llm, true);
  assert.deepEqual(first.force_high_fields, ['dpi']);

  nowMs = 10_500;
  const second = await loader.loadRuntimeOverrides();
  assert.equal(readCalls.length, 1);
  assert.deepEqual(second, first);

  nowMs = 13_500;
  await loader.loadRuntimeOverrides();
  assert.equal(readCalls.length, 2);
});

test('createRuntimeOverridesLoader falls back to defaults when storage read fails', async () => {
  const loader = createRuntimeOverridesLoader({
    storage: {
      async readJsonOrNull() {
        throw new Error('read failed');
      },
    },
    config: {},
    nowFn: () => 42_000,
    resolveRuntimeControlKeyFn: () => '_runtime/runtime-control.json',
    defaultRuntimeOverridesFn: () => ({ pause: false, disable_llm: false }),
    normalizeRuntimeOverridesFn: (payload = {}) => payload,
  });

  const result = await loader.loadRuntimeOverrides({ force: true });
  assert.deepEqual(result, { pause: false, disable_llm: false });
  assert.deepEqual(loader.getRuntimeOverrides(), { pause: false, disable_llm: false });
});

test('createRunTraceWriter returns trace writer when runtime tracing is enabled', () => {
  const created = [];
  const marker = { marker: 'trace-writer' };

  const result = createRunTraceWriter({
    storage: { marker: 'storage' },
    config: { runtimeTraceEnabled: true },
    runId: 'run.abc123',
    productId: 'mouse-sample',
    toBoolFn: (value, fallback) => (value === undefined ? fallback : Boolean(value)),
    createRuntimeTraceWriterFn: (options) => {
      created.push(options);
      return marker;
    },
  });

  assert.equal(result, marker);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0], {
    storage: { marker: 'storage' },
    runId: 'run.abc123',
    productId: 'mouse-sample',
  });
});

test('createRunTraceWriter returns null when runtime tracing is disabled', () => {
  const created = [];
  const result = createRunTraceWriter({
    storage: { marker: 'storage' },
    config: { runtimeTraceEnabled: false },
    runId: 'run.abc123',
    productId: 'mouse-sample',
    toBoolFn: (value, fallback) => (value === undefined ? fallback : Boolean(value)),
    createRuntimeTraceWriterFn: (options) => {
      created.push(options);
      return { marker: 'trace-writer' };
    },
  });

  assert.equal(result, null);
  assert.equal(created.length, 0);
});

// WHY: Combined imports create dangling async handles; force clean exit.
import { after } from 'node:test';
after(() => setTimeout(() => process.exit(0), 50));
