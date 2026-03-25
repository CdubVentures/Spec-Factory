import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildProductReviewPayload,
  buildReviewQueue,
  makeStorage,
  seedCategoryArtifacts,
  seedLatestArtifacts,
  seedQueueState,
} from './helpers/reviewGridDataHarness.js';

test('review payload and queue infer readable identity from product_id when normalized identity is missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-identity-fallback-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  const productId = 'mouse-acer-cestus-310-310';

  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, category);
    await seedLatestArtifacts(storage, category, productId, {
      identity: {},
    });
    await seedQueueState(storage, category, [productId]);
    await storage.writeObject(
      `final/${category}/${productId}/review/review_queue.json`,
      Buffer.from(JSON.stringify({
        version: 1,
        category,
        product_id: productId,
        count: 2,
        items: [{ field: 'dpi', reason_codes: ['missing_required_field'] }],
      }, null, 2), 'utf8'),
      { contentType: 'application/json' },
    );

    const payload = await buildProductReviewPayload({
      storage,
      config,
      category,
      productId,
      includeCandidates: false,
    });
    assert.equal(payload.identity.brand, 'Acer');
    assert.equal(payload.identity.model, 'Cestus 310');

    const queue = await buildReviewQueue({
      storage,
      config,
      category,
      status: 'needs_review',
      limit: 10,
    });
    assert.equal(queue.length, 1);
    assert.equal(queue[0].brand, 'Acer');
    assert.equal(queue[0].model, 'Cestus 310');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
