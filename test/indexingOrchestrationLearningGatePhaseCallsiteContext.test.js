import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningGatePhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildLearningGatePhaseCallsiteContext maps runProduct learning-gate callsite inputs to context keys', () => {
  const context = buildLearningGatePhaseCallsiteContext({
    fieldOrder: ['dpi'],
    fields: { dpi: '32000' },
    provenance: { dpi: [] },
    category: 'mouse',
    runId: 'run-1',
    runtimeFieldRulesEngine: { id: 'rules' },
    config: { selfImproveEnabled: true },
    logger: { info() {} },
    evaluateFieldLearningGates: () => ({}),
    emitLearningGateEvents: () => {},
  });

  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.fields, { dpi: '32000' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(typeof context.evaluateFieldLearningGates, 'function');
  assert.equal(typeof context.emitLearningGateEvents, 'function');
});
