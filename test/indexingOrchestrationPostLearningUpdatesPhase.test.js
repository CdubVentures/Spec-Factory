import test from 'node:test';
import assert from 'node:assert/strict';
import { runPostLearningUpdatesPhase } from '../src/features/indexing/orchestration/index.js';

test('runPostLearningUpdatesPhase delegates category brain + component library updates and stamps summary fields', async () => {
  const categoryCalls = [];
  const componentCalls = [];
  const summary = {
    source_intel: { domain_stats_key: 'k1' },
  };
  const expectedCategoryBrain = {
    keys: { latest: 'category-brain/latest.json' },
    promotion_update: { promoted: 2 },
    ignored: 'x',
  };
  const expectedComponentUpdate = {
    changed_components: 5,
  };

  const result = await runPostLearningUpdatesPhase({
    storage: { id: 'storage' },
    config: { selfImproveEnabled: true },
    category: 'mouse',
    job: { id: 'job' },
    normalized: { fields: { weight_g: '59' } },
    summary,
    provenance: { weight_g: [{ url: 'a' }] },
    sourceResults: [{ url: 'a' }],
    discoveryResult: { selected_sources: [] },
    runId: 'run_1',
    updateCategoryBrainFn: async (payload) => {
      categoryCalls.push(payload);
      return expectedCategoryBrain;
    },
    updateComponentLibraryFn: async (payload) => {
      componentCalls.push(payload);
      return expectedComponentUpdate;
    },
  });

  assert.deepEqual(categoryCalls, [{
    storage: { id: 'storage' },
    config: { selfImproveEnabled: true },
    category: 'mouse',
    job: { id: 'job' },
    normalized: { fields: { weight_g: '59' } },
    summary,
    provenance: { weight_g: [{ url: 'a' }] },
    sourceResults: [{ url: 'a' }],
    discoveryResult: { selected_sources: [] },
    runId: 'run_1',
  }]);
  assert.deepEqual(componentCalls, [{
    storage: { id: 'storage' },
    normalized: { fields: { weight_g: '59' } },
    summary,
    provenance: { weight_g: [{ url: 'a' }] },
  }]);
  assert.deepEqual(summary.category_brain, {
    keys: expectedCategoryBrain.keys,
    promotion_update: expectedCategoryBrain.promotion_update,
  });
  assert.equal(summary.component_library, expectedComponentUpdate);
  assert.deepEqual(result, {
    categoryBrain: expectedCategoryBrain,
    componentUpdate: expectedComponentUpdate,
  });
});
