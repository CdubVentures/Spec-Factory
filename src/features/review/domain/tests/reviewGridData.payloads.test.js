import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildReviewLayout,
  buildProductReviewPayload,
  buildReviewQueue,
  writeCategoryReviewArtifacts,
  writeProductReviewArtifacts,
  buildFieldState,
  makeStorage,
  writeJson,
  seedCategoryArtifacts,
  seedLatestArtifacts,
  seedQueueState,
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
      productId
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
      includeCandidates: false
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
        items: [{ field: 'dpi', reason_codes: ['missing_required_field'] }]
      }, null, 2), 'utf8'),
      { contentType: 'application/json' }
    );
    await storage.writeObject(
      `final/${category}/${productB}/review/review_queue.json`,
      Buffer.from(JSON.stringify({
        version: 1,
        category,
        product_id: productB,
        count: 1,
        items: [{ field: 'connection', reason_codes: ['low_confidence'] }]
      }, null, 2), 'utf8'),
      { contentType: 'application/json' }
    );

    const queue = await buildReviewQueue({
      storage,
      config,
      category,
      status: 'needs_review',
      limit: 10
    });
    assert.equal(queue.length, 2);
    assert.equal(queue[0].product_id, productA);
    assert.equal(queue[0].flags >= queue[1].flags, true);

    const written = await writeCategoryReviewArtifacts({
      storage,
      config,
      category,
      status: 'needs_review',
      limit: 10
    });
    assert.equal(written.count, 2);
    const stored = await storage.readJson(`_review/${category}/queue.json`);
    assert.equal(stored.count, 2);
    assert.equal(Array.isArray(stored.items), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('review payload and queue infer readable identity from product_id when normalized identity is missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-review-identity-fallback-'));
  const storage = makeStorage(tempRoot);
  const config = { categoryAuthorityRoot: path.join(tempRoot, 'category_authority') };
  const category = 'mouse';
  const productId = 'mouse-acer-cestus-310-310';
  try {
    await seedCategoryArtifacts(config.categoryAuthorityRoot, category);
    await seedLatestArtifacts(storage, category, productId, {
      identity: {}
    });
    await seedQueueState(storage, category, [productId]);
    await storage.writeObject(
      `final/${category}/${productId}/review/review_queue.json`,
      Buffer.from(JSON.stringify({
        version: 1,
        category,
        product_id: productId,
        count: 2,
        items: [{ field: 'dpi', reason_codes: ['missing_required_field'] }]
      }, null, 2), 'utf8'),
      { contentType: 'application/json' }
    );

    const payload = await buildProductReviewPayload({
      storage,
      config,
      category,
      productId,
      includeCandidates: false
    });
    assert.equal(payload.identity.brand, 'Acer');
    assert.equal(payload.identity.model, 'Cestus 310');

    const queue = await buildReviewQueue({
      storage,
      config,
      category,
      status: 'needs_review',
      limit: 10
    });
    assert.equal(queue.length, 1);
    assert.equal(queue[0].brand, 'Acer');
    assert.equal(queue[0].model, 'Cestus 310');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
