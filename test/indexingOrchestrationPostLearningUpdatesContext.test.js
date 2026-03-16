import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPostLearningUpdatesContext } from '../src/features/indexing/orchestration/index.js';

test('buildPostLearningUpdatesContext maps runProduct post-learning inputs to phase contract keys', () => {
  const updateCategoryBrain = async () => ({});
  const updateComponentLibrary = async () => ({});

  const context = buildPostLearningUpdatesContext({
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
    updateCategoryBrain,
    updateComponentLibrary,
  });

  assert.equal(context.storage.id, 'storage');
  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.updateCategoryBrainFn, updateCategoryBrain);
  assert.equal(context.updateComponentLibraryFn, updateComponentLibrary);
});
