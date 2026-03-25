import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  writeProductReviewArtifacts,
  makeStorage,
  seedCategoryArtifacts,
  seedLatestArtifacts,
} from './helpers/reviewGridDataHarness.js';

test('writeProductReviewArtifacts writes review candidates and per-field review queue', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-product-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro-wireless';

  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, category);
    await seedLatestArtifacts(storage, category, productId);
    const result = await writeProductReviewArtifacts({
      storage,
      config,
      category,
      productId,
    });

    assert.equal(result.candidate_count >= 2, true);
    assert.equal(result.review_field_count >= 1, true);

    const reviewBase = ['final', category, productId, 'review'].join('/');
    const candidates = await storage.readJson(`${reviewBase}/candidates.json`);
    const reviewQueue = await storage.readJson(`${reviewBase}/review_queue.json`);
    const product = await storage.readJson(`${reviewBase}/product.json`);

    assert.equal(Array.isArray(candidates.items), true);
    assert.equal(candidates.items.some((row) => row.field === 'weight'), true);
    assert.equal(candidates.items.some((row) => row.field === 'dpi'), true);
    assert.equal(Array.isArray(reviewQueue.items), true);
    assert.equal(reviewQueue.items.some((row) => row.field === 'dpi'), true);
    assert.equal(product.identity.brand, 'Razer');
    assert.equal(product.fields.weight.selected.value, 59);
    assert.equal(Array.isArray(product.fields.weight.candidates), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
