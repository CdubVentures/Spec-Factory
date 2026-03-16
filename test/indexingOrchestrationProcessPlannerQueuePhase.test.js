import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcessPlannerQueuePhase } from '../src/features/indexing/orchestration/index.js';

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
