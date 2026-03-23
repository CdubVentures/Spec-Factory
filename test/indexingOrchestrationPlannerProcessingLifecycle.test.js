import test from 'node:test';
import assert from 'node:assert/strict';

import { runPlannerProcessingLifecycle } from '../src/features/indexing/orchestration/execution/runPlannerProcessingLifecycle.js';

test('runPlannerProcessingLifecycle processes planner queue, repair search, and hypothesis followups while preserving updated state', async () => {
  const repairCalls = [];
  const hypothesisCalls = [];
  const stopCalls = [];
  const processPlannerQueueCalls = [];
  const buildHypothesisContextCalls = [];
  const stateByCall = [
    {
      runtimePauseAnnounced: true,
      artifactSequence: 2,
      phase08FieldContexts: { first: true },
      phase08PrimeRows: [{ batch: 1 }],
      llmSourcesUsed: 3,
      llmCandidatesAccepted: 4,
      terminalReason: '',
    },
    {
      runtimePauseAnnounced: false,
      artifactSequence: 5,
      phase08FieldContexts: { second: true },
      phase08PrimeRows: [{ batch: 2 }],
      llmSourcesUsed: 6,
      llmCandidatesAccepted: 7,
      terminalReason: '',
    },
  ];

  const result = await runPlannerProcessingLifecycle({
    initialState: {
      runtimePauseAnnounced: false,
      artifactSequence: 1,
      phase08FieldContexts: {},
      phase08PrimeRows: [],
      llmSourcesUsed: 0,
      llmCandidatesAccepted: 0,
      terminalReason: '',
      hypothesisFollowupRoundsExecuted: 0,
      hypothesisFollowupSeededUrls: 0,
    },
    logger: {
      events: [
        {
          event: 'repair_query_enqueued',
          domain: 'example.com',
          query: 'example mouse weight',
          field_targets: ['weight_g'],
          reason: 'missing_field',
          source_url: 'https://example.com/spec',
        },
      ],
    },
    config: {
      searchEngines: 'serpapi',
      maxRunSeconds: 999,
    },
    planner: { id: 'planner' },
    startMs: 0,
    nowFn: () => 1000,
    processPlannerQueueFn: async (currentState) => {
      processPlannerQueueCalls.push({
        artifactSequence: currentState.artifactSequence,
        llmSourcesUsed: currentState.llmSourcesUsed,
      });
      return stateByCall.shift();
    },
    runRepairSearchPhaseFn: async (input) => {
      repairCalls.push(input);
      await input.processPlannerQueueFn();
      return { repairSearchesCompleted: 1 };
    },
    runSearchFn: async ({ query }) => [{ url: `https://search.example/?q=${encodeURIComponent(query)}` }],
    buildHypothesisFollowupsContextFn: (state) => {
      buildHypothesisContextCalls.push(state);
      return {
        marker: 'hypothesis',
        hypothesisFollowupRoundsExecuted: state.hypothesisFollowupRoundsExecuted,
        hypothesisFollowupSeededUrls: state.hypothesisFollowupSeededUrls,
      };
    },
    runHypothesisFollowupsFn: async (input) => {
      hypothesisCalls.push(input);
      return {
        hypothesisFollowupRoundsExecuted: 2,
        hypothesisFollowupSeededUrls: 5,
      };
    },
    resolveHypothesisFollowupStateFn: ({ followupResult }) => followupResult,
    stopFetchersFn: async () => {
      stopCalls.push('stop');
    },
  });

  assert.deepEqual(processPlannerQueueCalls, [
    { artifactSequence: 1, llmSourcesUsed: 0 },
    { artifactSequence: 2, llmSourcesUsed: 3 },
  ]);
  assert.equal(repairCalls.length, 1);
  assert.deepEqual(repairCalls[0].repairEvents, [
    {
      domain: 'example.com',
      query: 'example mouse weight',
      field_targets: ['weight_g'],
      provider: 'serpapi',
      reason: 'missing_field',
      source_url: 'https://example.com/spec',
    },
  ]);
  assert.equal(buildHypothesisContextCalls.length, 1);
  assert.deepEqual(buildHypothesisContextCalls[0].phase08FieldContexts, { second: true });
  assert.equal(hypothesisCalls.length, 1);
  assert.deepEqual(hypothesisCalls[0], {
    marker: 'hypothesis',
    hypothesisFollowupRoundsExecuted: 0,
    hypothesisFollowupSeededUrls: 0,
  });
  assert.deepEqual(stopCalls, ['stop']);
  assert.deepEqual(result, {
    runtimePauseAnnounced: false,
    artifactSequence: 5,
    phase08FieldContexts: { second: true },
    phase08PrimeRows: [{ batch: 2 }],
    llmSourcesUsed: 6,
    llmCandidatesAccepted: 7,
    terminalReason: '',
    hypothesisFollowupRoundsExecuted: 2,
    hypothesisFollowupSeededUrls: 5,
  });
});

test('runPlannerProcessingLifecycle stops on run budget exhaustion before repair or followup phases', async () => {
  const repairCalls = [];
  const hypothesisCalls = [];
  const stopCalls = [];

  const result = await runPlannerProcessingLifecycle({
    initialState: {
      runtimePauseAnnounced: false,
      artifactSequence: 1,
      phase08FieldContexts: {},
      phase08PrimeRows: [],
      llmSourcesUsed: 0,
      llmCandidatesAccepted: 0,
      terminalReason: '',
      hypothesisFollowupRoundsExecuted: 1,
      hypothesisFollowupSeededUrls: 2,
    },
    logger: {
      events: [
        {
          event: 'repair_query_enqueued',
          domain: 'example.com',
          query: 'example mouse weight',
        },
      ],
    },
    config: {
      searchEngines: 'serpapi',
      maxRunSeconds: 30,
    },
    startMs: 0,
    nowFn: () => 30_000,
    processPlannerQueueFn: async () => ({
      runtimePauseAnnounced: true,
      artifactSequence: 3,
      phase08FieldContexts: { after: true },
      phase08PrimeRows: [{ batch: 3 }],
      llmSourcesUsed: 4,
      llmCandidatesAccepted: 5,
      terminalReason: '',
    }),
    runRepairSearchPhaseFn: async (input) => {
      repairCalls.push(input);
    },
    runHypothesisFollowupsFn: async (input) => {
      hypothesisCalls.push(input);
      return {};
    },
    stopFetchersFn: async () => {
      stopCalls.push('stop');
    },
  });

  assert.deepEqual(repairCalls, []);
  assert.deepEqual(hypothesisCalls, []);
  assert.deepEqual(stopCalls, ['stop']);
  assert.equal(result.terminalReason, 'max_run_seconds_reached');
  assert.equal(result.artifactSequence, 3);
  assert.equal(result.hypothesisFollowupRoundsExecuted, 1);
  assert.equal(result.hypothesisFollowupSeededUrls, 2);
});

test('runPlannerProcessingLifecycle stops fetchers when planner processing throws', async () => {
  const stopCalls = [];

  await assert.rejects(
    runPlannerProcessingLifecycle({
      initialState: {
        terminalReason: '',
        hypothesisFollowupRoundsExecuted: 0,
        hypothesisFollowupSeededUrls: 0,
      },
      processPlannerQueueFn: async () => {
        throw new Error('planner failed');
      },
      stopFetchersFn: async () => {
        stopCalls.push('stop');
      },
    }),
    /planner failed/,
  );

  assert.deepEqual(stopCalls, ['stop']);
});
