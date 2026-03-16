import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisArtifactKeyPhaseContext } from '../src/features/indexing/orchestration/index.js';

test('buildAnalysisArtifactKeyPhaseContext maps runProduct analysis-key inputs to context contract keys', () => {
  const context = buildAnalysisArtifactKeyPhaseContext({
    storage: { marker: 'storage' },
    category: 'mouse',
    productId: 'mouse-product',
    runBase: 'runs/base',
    summary: { validated: true },
  });

  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'mouse-product');
  assert.equal(context.runBase, 'runs/base');
  assert.deepEqual(context.summary, { validated: true });
});
