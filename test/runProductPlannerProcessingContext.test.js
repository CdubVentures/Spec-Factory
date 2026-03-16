import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRunProductPlannerProcessingContext } from '../src/pipeline/seams/buildRunProductPlannerProcessingContext.js';

test('buildRunProductPlannerProcessingContext preserves runProduct planner lifecycle wiring and search recording', async () => {
  const calls = [];
  const bootstrapState = {
    artifactSequence: 2,
    phase08FieldContexts: { before: true },
    phase08PrimeRows: [{ batch: 1 }],
    llmSourcesUsed: 3,
    llmCandidatesAccepted: 4,
    hypothesisFollowupRoundsExecuted: 1,
    hypothesisFollowupSeededUrls: 2,
    planner: { id: 'planner' },
    sourceResults: [{ url: 'https://example.com/spec' }],
    categoryConfig: { fieldOrder: ['dpi'] },
    fieldOrder: ['dpi'],
    anchors: { shape: 'ergonomic' },
    job: { productId: 'mouse-1' },
    requiredFields: ['dpi'],
    sourceIntel: { domains: {} },
    blockedDomainHitCount: new Map(),
    blockedDomainThreshold: 2,
    blockedDomainsApplied: new Set(),
    llmRetryReasonByUrl: new Map(),
    sourceResults: [],
    successfulSourceMetaByUrl: new Map(),
    frontierDb: { id: 'frontier-db' },
    repairSearchEnabled: true,
    repairDedupeRule: 'domain_once',
    repairQueryByDomain: new Set(),
    artifactsByHost: {},
    adapterArtifacts: [],
    llmSatisfiedFields: new Set(),
    phase08BatchRows: [],
    runArtifactsBase: 'runs/base',
    storage: { id: 'storage' },
    fetcher: { id: 'fetcher' },
    fetcherMode: 'playwright',
    fetchHostConcurrencyGate: { id: 'host-gate' },
    resumeFetchFailedUrls: new Set(['https://failed.example.com']),
    resumeCooldownSkippedUrls: new Set(['https://cooldown.example.com']),
    runtimeControlKey: 'runtime/control.json',
    startMs: 50,
    hostBudgetByHost: new Map(),
    attemptedSourceUrls: new Set(),
    logger: {
      events: [
        {
          event: 'repair_query_enqueued',
          domain: 'example.com',
          query: 'mouse dpi',
          field_targets: ['dpi'],
          reason: 'missing_field',
          source_url: 'https://example.com/spec',
        },
      ],
      info() {},
      warn() {},
    },
    category: 'mouse',
    productId: 'mouse-1',
    runId: 'run-1',
  };

  const context = buildRunProductPlannerProcessingContext({
    bootstrapState,
    config: { searchProvider: 'serpapi', maxRunSeconds: 999 },
    getRuntimeOverridesFn: () => ({ blocked_domains: ['runtime.example.com'] }),
    syncRuntimeOverridesFn: async () => ({ blocked_domains: ['runtime.example.com'] }),
    modeAwareFetcherRegistry: {
      async stopAll() {
        calls.push(['stopAll']);
      },
      async fetchWithMode() {},
    },
    deps: {
      buildProcessPlannerQueuePhaseCallsiteContextFn: (input) => {
        calls.push(['buildProcessPlannerQueuePhaseCallsiteContext', input.category, input.runtimeControlKey]);
        return { marker: 'planner-queue-context' };
      },
      runProcessPlannerQueuePhaseFn: async (input) => {
        calls.push(['runProcessPlannerQueuePhase', input.initialState, input.marker]);
        return {
          runtimePauseAnnounced: false,
          artifactSequence: 5,
          phase08FieldContexts: { after: true },
          phase08PrimeRows: [{ batch: 2 }],
          llmSourcesUsed: 6,
          llmCandidatesAccepted: 7,
          terminalReason: '',
        };
      },
      importSearchProvidersFn: async () => ({
        runSearchProviders: async ({ query }) => {
          calls.push(['runSearchProviders', query]);
          return [{ url: 'https://search.example.com/result' }];
        },
      }),
      defaultIndexLabRootFn: () => 'indexlab-root',
      pathJoinFn: (...parts) => parts.join('/'),
      mkdirSyncFn: (dir, options) => {
        calls.push(['mkdirSync', dir, options]);
      },
      recordQueryResultFn: (payload, outputPath) => {
        calls.push(['recordQueryResult', payload, outputPath]);
      },
      buildHypothesisFollowupsContextFn: (input) => {
        calls.push(['buildHypothesisFollowupsContext', input.hypothesisFollowupRoundsExecuted, input.hypothesisFollowupSeededUrls]);
        return {
          marker: 'hypothesis-context',
          hypothesisFollowupRoundsExecuted: input.hypothesisFollowupRoundsExecuted,
          hypothesisFollowupSeededUrls: input.hypothesisFollowupSeededUrls,
        };
      },
      runRepairSearchPhaseFn: async (input) => {
        calls.push(['runRepairSearchPhase', input.repairEvents.length]);
        return { repairSearchesCompleted: 1 };
      },
      runHypothesisFollowupsFn: async (input) => {
        calls.push(['runHypothesisFollowups', input.marker]);
        return {
          hypothesisFollowupRoundsExecuted: 4,
          hypothesisFollowupSeededUrls: 5,
        };
      },
      resolveHypothesisFollowupStateFn: ({ followupResult }) => followupResult,
      nowFn: () => 1234,
    },
  });

  assert.deepEqual(context.initialState, {
    runtimePauseAnnounced: false,
    artifactSequence: 2,
    phase08FieldContexts: { before: true },
    phase08PrimeRows: [{ batch: 1 }],
    llmSourcesUsed: 3,
    llmCandidatesAccepted: 4,
    terminalReason: '',
    hypothesisFollowupRoundsExecuted: 1,
    hypothesisFollowupSeededUrls: 2,
  });

  const processResult = await context.processPlannerQueueFn({
    runtimePauseAnnounced: true,
    artifactSequence: 3,
    phase08FieldContexts: { keep: true },
    phase08PrimeRows: [{ batch: 9 }],
    llmSourcesUsed: 10,
    llmCandidatesAccepted: 11,
    terminalReason: 'keep-existing',
  });
  const searchResults = await context.runSearchFn({ query: 'mouse dpi' });
  const followupContext = context.buildHypothesisFollowupsContextFn({
    hypothesisFollowupRoundsExecuted: 8,
    hypothesisFollowupSeededUrls: 13,
  });
  const followupResult = await context.runHypothesisFollowupsFn(followupContext);
  await context.stopFetchersFn();

  assert.deepEqual(processResult, {
    runtimePauseAnnounced: false,
    artifactSequence: 5,
    phase08FieldContexts: { after: true },
    phase08PrimeRows: [{ batch: 2 }],
    llmSourcesUsed: 6,
    llmCandidatesAccepted: 7,
    terminalReason: 'keep-existing',
  });
  assert.deepEqual(searchResults, [{ url: 'https://search.example.com/result' }]);
  assert.deepEqual(followupContext, {
    marker: 'hypothesis-context',
    hypothesisFollowupRoundsExecuted: 8,
    hypothesisFollowupSeededUrls: 13,
  });
  assert.deepEqual(followupResult, {
    hypothesisFollowupRoundsExecuted: 4,
    hypothesisFollowupSeededUrls: 5,
  });
  assert.ok(calls.some(([name]) => name === 'buildProcessPlannerQueuePhaseCallsiteContext'));
  assert.ok(calls.some(([name]) => name === 'runProcessPlannerQueuePhase'));
  assert.ok(calls.some(([name]) => name === 'runSearchProviders'));
  assert.ok(calls.some(([name]) => name === 'recordQueryResult'));
  assert.ok(calls.some(([name]) => name === 'buildHypothesisFollowupsContext'));
  assert.ok(calls.some(([name]) => name === 'runHypothesisFollowups'));
  assert.ok(calls.some(([name]) => name === 'stopAll'));
});
