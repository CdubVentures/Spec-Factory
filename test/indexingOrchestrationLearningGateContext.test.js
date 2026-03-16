import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningGateContext } from '../src/features/indexing/orchestration/index.js';

test('buildLearningGateContext maps runProduct learning-gate inputs to phase contract keys', () => {
  const evaluateFieldLearningGates = () => ({ gateResults: [], acceptedUpdates: [] });
  const emitLearningGateEvents = () => {};

  const context = buildLearningGateContext({
    fieldOrder: ['dpi'],
    fields: { dpi: '32000' },
    provenance: { dpi: [{ source: 'https://example.com' }] },
    category: 'mouse',
    runId: 'run-1',
    runtimeFieldRulesEngine: { id: 'rules' },
    config: { selfImproveEnabled: true },
    logger: { info() {} },
    evaluateFieldLearningGates,
    emitLearningGateEvents,
  });

  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.fields, { dpi: '32000' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.evaluateFieldLearningGatesFn, evaluateFieldLearningGates);
  assert.equal(context.emitLearningGateEventsFn, emitLearningGateEvents);
});
