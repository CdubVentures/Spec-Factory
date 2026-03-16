import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunResultPayloadPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunResultPayloadPhaseCallsiteContext maps runProduct return callsite inputs to context keys', () => {
  const context = buildRunResultPayloadPhaseCallsiteContext({
    job: { id: 1 },
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    summary: { validated: true },
    runId: 'run_123',
    productId: 'mouse-product',
    exportInfo: { artifacts: 3 },
    finalExport: { ok: true },
    learning: { accepted: 1 },
    learningGateResult: { gateResults: [] },
    categoryBrain: { keys: ['a'] },
  });

  assert.deepEqual(context.job, { id: 1 });
  assert.deepEqual(context.normalized, { fields: { dpi: 32000 } });
  assert.deepEqual(context.provenance, { dpi: [] });
  assert.deepEqual(context.summary, { validated: true });
  assert.equal(context.runId, 'run_123');
  assert.equal(context.productId, 'mouse-product');
  assert.deepEqual(context.exportInfo, { artifacts: 3 });
  assert.deepEqual(context.finalExport, { ok: true });
  assert.deepEqual(context.learning, { accepted: 1 });
  assert.deepEqual(context.learningGateResult, { gateResults: [] });
  assert.deepEqual(context.categoryBrain, { keys: ['a'] });
});
