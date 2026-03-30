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

// WHY: Product IDs are opaque hex tokens. inferIdentityFromProductId was gutted
// (always returns empty). Identity comes from catalog/specDb, not from the ID string.
test('review payload returns empty identity when catalog and db have no identity data', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-identity-fallback-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  const productId = 'mouse-a1b2c3d4';

  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, category);
    await seedLatestArtifacts(storage, category, productId, {
      identity: {},
    });

    const payload = await buildProductReviewPayload({
      storage,
      config,
      category,
      productId,
      includeCandidates: false,
    });
    assert.equal(payload.identity.brand, '');
    assert.equal(payload.identity.model, '');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('review payload uses catalog identity when available', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-identity-catalog-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  const productId = 'mouse-a1b2c3d4';

  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, category);
    await seedLatestArtifacts(storage, category, productId, {
      identity: { brand: 'Acer', model: 'Cestus 310' },
    });

    const payload = await buildProductReviewPayload({
      storage,
      config,
      category,
      productId,
      includeCandidates: false,
    });
    assert.equal(payload.identity.brand, 'Acer');
    assert.equal(payload.identity.model, 'Cestus 310');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
