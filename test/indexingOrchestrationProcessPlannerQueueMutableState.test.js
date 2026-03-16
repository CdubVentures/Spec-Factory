import test from 'node:test';
import assert from 'node:assert/strict';
import { createProcessPlannerQueueMutableState } from '../src/features/indexing/orchestration/index.js';

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
