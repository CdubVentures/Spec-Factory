import test from 'node:test';
import assert from 'node:assert/strict';
import { runLearningGatePhase } from '../src/features/indexing/orchestration/index.js';

test('runLearningGatePhase delegates gate evaluation and event emission with canonical payloads', () => {
  const evaluateCalls = [];
  const emitCalls = [];
  const logger = {};
  const runtimeFieldRulesEngine = { id: 'rules-engine' };
  const expectedResult = {
    gateResults: [{ fieldKey: 'weight_g', status: 'accepted' }],
    acceptedUpdates: [{ fieldKey: 'weight_g' }],
  };

  const result = runLearningGatePhase({
    fieldOrder: ['weight_g'],
    fields: { weight_g: '59g' },
    provenance: { weight_g: [{ source: 'a' }] },
    category: 'mouse',
    runId: 'run_1',
    runtimeFieldRulesEngine,
    config: { selfImproveEnabled: true },
    logger,
    evaluateFieldLearningGatesFn: (payload) => {
      evaluateCalls.push(payload);
      return expectedResult;
    },
    emitLearningGateEventsFn: (payload) => {
      emitCalls.push(payload);
    },
  });

  assert.equal(result, expectedResult);
  assert.deepEqual(evaluateCalls, [{
    fieldOrder: ['weight_g'],
    fields: { weight_g: '59g' },
    provenance: { weight_g: [{ source: 'a' }] },
    category: 'mouse',
    runId: 'run_1',
    fieldRulesEngine: runtimeFieldRulesEngine,
    config: { selfImproveEnabled: true },
  }]);
  assert.deepEqual(emitCalls, [{
    gateResults: expectedResult.gateResults,
    logger,
    runId: 'run_1',
  }]);
});
