import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchArtifactsPhaseContext } from '../src/features/indexing/orchestration/index.js';

test('buildResearchArtifactsPhaseContext maps runProduct research-artifacts inputs to phase contract keys', () => {
  const context = buildResearchArtifactsPhaseContext({
    uberAggressiveMode: true,
    frontierDb: { marker: 'frontier' },
    uberOrchestrator: { marker: 'orchestrator' },
    storage: { marker: 'storage' },
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run_123',
    discoveryResult: { queries: ['q'] },
    previousFinalSpec: { fields: {} },
    normalized: { fields: { dpi: 32000 } },
    fieldOrder: ['dpi'],
    summary: { validated: true },
    runtimeMode: 'uber_aggressive',
  });

  assert.equal(context.uberAggressiveMode, true);
  assert.deepEqual(context.frontierDb, { marker: 'frontier' });
  assert.deepEqual(context.uberOrchestrator, { marker: 'orchestrator' });
  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'mouse-product');
  assert.equal(context.runId, 'run_123');
  assert.deepEqual(context.discoveryResult, { queries: ['q'] });
  assert.deepEqual(context.previousFinalSpec, { fields: {} });
  assert.deepEqual(context.normalized, { fields: { dpi: 32000 } });
  assert.deepEqual(context.fieldOrder, ['dpi']);
  assert.deepEqual(context.summary, { validated: true });
  assert.equal(context.runtimeMode, 'uber_aggressive');
});
