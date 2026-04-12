import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductReviewPayload,
  CATEGORY,
  withSeededSpecDbFixture,
} from '../../tests/helpers/reviewEcosystemHarness.js';

test('buildProductReviewPayload can omit candidate payloads for lightweight grid rendering', { timeout: 30_000 }, async () => {
  await withSeededSpecDbFixture(async ({ storage, config, db }) => {
    const payload = await buildProductReviewPayload({
      storage,
      config,
      category: CATEGORY,
      productId: 'mouse-zowie-ec2-c',
      includeCandidates: false,
      specDb: db,
    });

    assert.equal(payload.product_id, 'mouse-zowie-ec2-c');
    assert.equal(payload.fields.weight.candidate_count >= 1, true);
    assert.deepEqual(payload.fields.weight.candidates, []);
    assert.equal(payload.fields.weight.selected.status, 'ok');
  });
});
