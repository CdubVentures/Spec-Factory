import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductReviewPayload,
  CATEGORY,
  withSeededSpecDbFixture,
} from '../../tests/helpers/reviewEcosystemHarness.js';

test('review payload returns empty identity when catalog and db have no identity data', { timeout: 30_000 }, async () => {
  await withSeededSpecDbFixture(async ({ storage, config, db }) => {
    const payload = await buildProductReviewPayload({
      storage,
      config,
      category: CATEGORY,
      productId: 'mouse-nonexistent-product',
      specDb: db,
      includeCandidates: false,
    });
    assert.equal(payload.identity.brand, '');
    assert.equal(payload.identity.base_model, '');
    assert.equal(payload.identity.model, '');
  });
});

test('review payload uses catalog identity when available', { timeout: 30_000 }, async () => {
  await withSeededSpecDbFixture(async ({ storage, config, db }) => {
    const payload = await buildProductReviewPayload({
      storage,
      config,
      category: CATEGORY,
      productId: 'mouse-razer-viper-v3-pro',
      specDb: db,
      catalogProduct: { brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro', variant: '' },
      includeCandidates: false,
    });
    assert.equal(payload.identity.brand, 'Razer');
    assert.equal(payload.identity.base_model, 'Viper V3 Pro');
    assert.equal(payload.identity.model, 'Viper V3 Pro');
  });
});
