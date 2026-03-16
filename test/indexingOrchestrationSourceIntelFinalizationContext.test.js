import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceIntelFinalizationContext } from '../src/features/indexing/orchestration/index.js';

test('buildSourceIntelFinalizationContext maps runProduct source-intel inputs to phase contract keys', () => {
  const context = buildSourceIntelFinalizationContext({
    storage: { id: 'storage' },
    config: { enableIntel: true },
    category: 'mouse',
    productId: 'product-1',
    brand: 'Logitech',
    sourceResults: [{ url: 'https://example.com/spec' }],
    provenance: { dpi: [{ source: 'https://example.com/spec' }] },
    categoryConfig: { key: 'mouse' },
    constraintAnalysis: { contradictions: [] },
    summary: { confidence: 0.9 },
    persistSourceIntel: async () => ({}),
  });

  assert.equal(context.storage.id, 'storage');
  assert.equal(context.category, 'mouse');
  assert.equal(context.productId, 'product-1');
  assert.equal(context.brand, 'Logitech');
  assert.deepEqual(context.sourceResults, [{ url: 'https://example.com/spec' }]);
  assert.deepEqual(context.provenance, { dpi: [{ source: 'https://example.com/spec' }] });
  assert.deepEqual(context.categoryConfig, { key: 'mouse' });
  assert.deepEqual(context.constraintAnalysis, { contradictions: [] });
  assert.deepEqual(context.summary, { confidence: 0.9 });
  assert.equal(typeof context.persistSourceIntelFn, 'function');
});
