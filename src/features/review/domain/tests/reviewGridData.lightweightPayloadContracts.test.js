import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildProductReviewPayload,
  makeStorage,
  seedCategoryArtifacts,
  seedLatestArtifacts,
} from './helpers/reviewGridDataHarness.js';

test('buildProductReviewPayload can omit candidate payloads for lightweight grid rendering', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-product-lite-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro-wireless-lite';

  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, category);
    await seedLatestArtifacts(storage, category, productId);
    const payload = await buildProductReviewPayload({
      storage,
      config,
      category,
      productId,
      includeCandidates: false,
    });

    assert.equal(payload.product_id, productId);
    assert.equal(payload.fields.weight.selected.value, 59);
    assert.equal(payload.fields.weight.candidate_count >= 1, true);
    assert.deepEqual(payload.fields.weight.candidates, []);
    assert.equal(payload.fields.dpi.needs_review, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
