import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlannerQueueRuntime,
  runProcessPlannerQueuePhase,
} from '../src/features/indexing/orchestration/index.js';

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
