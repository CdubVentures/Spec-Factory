import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHypothesisFollowupsContext } from '../src/features/indexing/orchestration/index.js';

test('buildHypothesisFollowupsContext maps runProduct follow-up inputs to phase contract keys', () => {
  const processPlannerQueue = async () => {};
  const context = buildHypothesisFollowupsContext({
    config: { maxRunSeconds: 60 },
    startMs: 123,
    logger: { info() {} },
    planner: { id: 'planner' },
    processPlannerQueue,
    sourceResults: [{ id: 1 }],
    categoryConfig: { id: 'cat' },
    fieldOrder: ['name'],
    anchors: { name: {} },
    job: { id: 'job' },
    productId: 'product-1',
    category: 'mouse',
    requiredFields: ['name'],
    sourceIntel: { id: 'intel' },
    hypothesisFollowupRoundsExecuted: 2,
    hypothesisFollowupSeededUrls: new Set(['https://example.com']),
    isHelperSyntheticSourceFn: () => false,
  });

  assert.equal(context.processPlannerQueueFn, processPlannerQueue);
  assert.equal(context.productId, 'product-1');
  assert.equal(context.category, 'mouse');
  assert.equal(context.hypothesisFollowupRoundsExecuted, 2);
});
