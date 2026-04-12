import test from 'node:test';
import assert from 'node:assert/strict';

import {
  writeProductReviewArtifacts,
} from '../reviewGridData.js';
import {
  CATEGORY,
  withSeededSpecDbFixture,
} from '../../tests/helpers/reviewEcosystemHarness.js';

test('writeProductReviewArtifacts writes review candidates and product payload', { timeout: 30_000 }, async () => {
  await withSeededSpecDbFixture(async ({ storage, config, db }) => {
    const productId = 'mouse-zowie-ec2-c';
    const result = await writeProductReviewArtifacts({
      storage,
      config,
      category: CATEGORY,
      productId,
      specDb: db,
    });

    assert.equal(result.candidate_count >= 1, true);

    const reviewBase = ['final', CATEGORY, productId, 'review'].join('/');
    const candidates = await storage.readJson(`${reviewBase}/candidates.json`);
    const product = await storage.readJson(`${reviewBase}/product.json`);

    assert.equal(Array.isArray(candidates.items), true);
    assert.equal(candidates.items.some((row) => row.field === 'weight'), true);
    assert.equal(product.fields.weight.selected.status, 'ok');
    assert.equal(Array.isArray(product.fields.weight.candidates), true);
  });
});
