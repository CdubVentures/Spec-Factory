import test from 'node:test';
import assert from 'node:assert/strict';
import { runTerminalLearningExportLifecycle } from '../src/features/indexing/orchestration/index.js';

test('runTerminalLearningExportLifecycle runs learning export then finalize lifecycle with canonical payloads', async () => {
  const exportCalls = [];
  const finalizeCalls = [];
  const learningExportPhaseContext = { phase: 'learning-export' };
  const expectedExport = {
    exportInfo: { key: 'info' },
    finalExport: { key: 'final' },
    learning: { key: 'learning' },
  };
  const logger = { id: 'logger' };
  const frontierDb = { id: 'frontier' };
  const emitFieldDecisionEventsFn = () => {};

  const result = await runTerminalLearningExportLifecycle({
    learningExportPhaseContext,
    runLearningExportPhaseFn: async (payload) => {
      exportCalls.push(payload);
      return expectedExport;
    },
    finalizeRunLifecycleFn: async (payload) => {
      finalizeCalls.push(payload);
    },
    logger,
    frontierDb,
    fieldOrder: ['weight_g'],
    normalized: { fields: { weight_g: '59' } },
    provenance: { weight_g: [{ url: 'a' }] },
    fieldReasoning: [{ field: 'weight_g' }],
    trafficLight: { score: 0.9 },
    emitFieldDecisionEventsFn,
  });

  assert.deepEqual(exportCalls, [learningExportPhaseContext]);
  assert.deepEqual(finalizeCalls, [{
    logger,
    frontierDb,
    fieldOrder: ['weight_g'],
    normalized: { fields: { weight_g: '59' } },
    provenance: { weight_g: [{ url: 'a' }] },
    fieldReasoning: [{ field: 'weight_g' }],
    trafficLight: { score: 0.9 },
    emitFieldDecisionEventsFn,
  }]);
  assert.deepEqual(result, expectedExport);
});
