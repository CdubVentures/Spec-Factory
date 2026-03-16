import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunResultPayload } from '../src/features/indexing/orchestration/index.js';

test('buildRunResultPayload builds canonical runProduct return envelope', () => {
  const payload = buildRunResultPayload({
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

  assert.deepEqual(payload.job, { id: 1 });
  assert.deepEqual(payload.normalized, { fields: { dpi: 32000 } });
  assert.deepEqual(payload.provenance, { dpi: [] });
  assert.deepEqual(payload.summary, { validated: true });
  assert.equal(payload.runId, 'run_123');
  assert.equal(payload.productId, 'mouse-product');
  assert.deepEqual(payload.exportInfo, { artifacts: 3 });
  assert.deepEqual(payload.finalExport, { ok: true });
  assert.deepEqual(payload.learning, { accepted: 1 });
  assert.deepEqual(payload.learningGateResult, { gateResults: [] });
  assert.deepEqual(payload.categoryBrain, { keys: ['a'] });
});
