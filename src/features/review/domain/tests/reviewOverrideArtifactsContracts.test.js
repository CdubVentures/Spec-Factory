import test from 'node:test';
import assert from 'node:assert/strict';

import { readReviewArtifacts } from '../overrideWorkflow.js';
import { createReviewOverrideHarness } from './helpers/reviewOverrideHarness.js';

test('readReviewArtifacts returns safe defaults when review files do not exist', async (t) => {
  const harness = await createReviewOverrideHarness(t, {
    productId: 'missing-review',
  });
  const { storage, category, productId, specDb } = harness;

  const result = await readReviewArtifacts({
    storage,
    category,
    productId,
  });

  assert.equal(Array.isArray(result.candidates.items), true);
  assert.equal(Array.isArray(result.reviewQueue.items), true);
  assert.equal(result.candidates.product_id, productId);
  assert.equal(result.reviewQueue.product_id, productId);
  assert.equal(result.reviewQueue.count, 0);
});
