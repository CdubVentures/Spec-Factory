import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildReviewQueue,
  writeCategoryReviewArtifacts,
  makeStorage,
  seedCategoryArtifacts,
  seedLatestArtifacts,
  seedQueueState,
} from './helpers/reviewGridDataHarness.js';

test('buildReviewQueue sorts products by urgency and writeCategoryReviewArtifacts persists queue', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-queue-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';

  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, category);
    const productA = 'mouse-a';
    const productB = 'mouse-b';
    await seedLatestArtifacts(storage, category, productA);
    await seedLatestArtifacts(storage, category, productB);
    await seedQueueState(storage, category, [productA, productB]);

    await storage.writeObject(
      `final/${category}/${productA}/review/review_queue.json`,
      Buffer.from(JSON.stringify({
        version: 1,
        category,
        product_id: productA,
        count: 4,
        items: [{ field: 'dpi', reason_codes: ['missing_required_field'] }],
      }, null, 2), 'utf8'),
      { contentType: 'application/json' },
    );
    await storage.writeObject(
      `final/${category}/${productB}/review/review_queue.json`,
      Buffer.from(JSON.stringify({
        version: 1,
        category,
        product_id: productB,
        count: 1,
        items: [{ field: 'connection', reason_codes: ['low_confidence'] }],
      }, null, 2), 'utf8'),
      { contentType: 'application/json' },
    );

    const queue = await buildReviewQueue({
      storage,
      config,
      category,
      status: 'needs_review',
      limit: 10,
    });
    assert.equal(queue.length, 2);
    assert.equal(queue[0].product_id, productA);
    assert.equal(queue[0].flags >= queue[1].flags, true);

    const written = await writeCategoryReviewArtifacts({
      storage,
      config,
      category,
      status: 'needs_review',
      limit: 10,
    });
    assert.equal(written.count, 2);
    const stored = await storage.readJson(`_review/${category}/queue.json`);
    assert.equal(stored.count, 2);
    assert.equal(Array.isArray(stored.items), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
