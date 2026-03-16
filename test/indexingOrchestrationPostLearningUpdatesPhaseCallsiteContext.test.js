import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPostLearningUpdatesPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildPostLearningUpdatesPhaseCallsiteContext maps runProduct post-learning callsite inputs to context keys', () => {
  const context = buildPostLearningUpdatesPhaseCallsiteContext({
    storage: { id: 'storage' },
    config: { selfImproveEnabled: true },
    category: 'mouse',
    job: { id: 'job-1' },
    normalized: { fields: { dpi: '32000' } },
    summary: { confidence: 0.9 },
    provenance: { dpi: [{ source: 'https://example.com' }] },
    sourceResults: [{ url: 'https://example.com' }],
    discoveryResult: { selected_sources: [] },
    runId: 'run-1',
    updateCategoryBrain: async () => ({}),
    updateComponentLibrary: async () => ({}),
  });

  assert.equal(context.storage.id, 'storage');
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(typeof context.updateCategoryBrain, 'function');
  assert.equal(typeof context.updateComponentLibrary, 'function');
});
