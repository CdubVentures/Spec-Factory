import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  makeStorage,
  createCategoryFixture,
  seedLatest,
  seedApprovedOverride,
  publishProducts,
  readPublishedChangelog,
  readPublishedProvenance,
} from './helpers/publishingPipelineHarness.js';

test('publishProducts merges approved overrides, writes artifacts, and versions diffs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase9-publish-'));
  const storage = makeStorage(tempRoot);
  const helperRoot = path.join(tempRoot, 'category_authority');
  const category = 'mouse';
  const productId = 'mouse-razer-viper-v3-pro-wireless';

  try {
    await createCategoryFixture(helperRoot, category);
    await seedLatest(storage, category, productId, { weight: '59', dpi: '26000' });
    await seedApprovedOverride(helperRoot, category, productId, '58');

    const first = await publishProducts({
      storage,
      config: { categoryAuthorityRoot: helperRoot },
      category,
      productIds: [productId]
    });

    assert.equal(first.published_count, 1);
    assert.equal(first.blocked_count, 0);

    const current = await storage.readJson(`output/${category}/published/${productId}/current.json`);
    assert.equal(current.published_version, '1.0.0');
    assert.equal(current.specs.weight, 58);
    assert.equal(current.metrics.human_overrides, 1);

    const compact = await storage.readJson(`output/${category}/published/${productId}/compact.json`);
    assert.equal(compact.specs.weight, 58);

    const prov = await readPublishedProvenance({
      storage,
      category,
      productId,
      field: 'weight'
    });
    assert.equal(prov.field, 'weight');
    assert.equal(prov.provenance.evidence[0].snippet_id, 'snp_weight_1');

    await seedApprovedOverride(helperRoot, category, productId, '57');
    const second = await publishProducts({
      storage,
      config: { categoryAuthorityRoot: helperRoot },
      category,
      productIds: [productId]
    });

    assert.equal(second.published_count, 1);
    const secondCurrent = await storage.readJson(`output/${category}/published/${productId}/current.json`);
    assert.equal(secondCurrent.published_version, '1.0.1');
    assert.equal(secondCurrent.specs.weight, 57);

    const archivedV1 = await storage.readJson(`output/${category}/published/${productId}/versions/v1.0.0.json`);
    assert.equal(archivedV1.specs.weight, 58);

    const changelog = await readPublishedChangelog({ storage, category, productId });
    assert.equal(Array.isArray(changelog.entries), true);
    assert.equal(changelog.entries.length >= 2, true);
    assert.equal(changelog.entries[0].changes.some((row) => row.field === 'weight'), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('publishProducts resolves approved override targets via allApproved', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase9-publish-all-approved-'));
  const storage = makeStorage(tempRoot);
  const helperRoot = path.join(tempRoot, 'category_authority');
  const category = 'mouse';
  const productId = 'mouse-synthetic-all-approved';

  try {
    await createCategoryFixture(helperRoot, category);
    await seedLatest(storage, category, productId, { weight: '59', dpi: '26000' });
    await seedApprovedOverride(helperRoot, category, productId, '58');

    const result = await publishProducts({
      storage,
      config: { categoryAuthorityRoot: helperRoot },
      category,
      allApproved: true
    });

    assert.equal(result.processed_count, 1);
    assert.equal(result.published_count, 1);
    assert.equal(result.results[0]?.product_id, productId);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('publishProducts blocks invalid override values via runtime validation', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase9-publish-block-'));
  const storage = makeStorage(tempRoot);
  const helperRoot = path.join(tempRoot, 'category_authority');
  const category = 'mouse';
  const productId = 'mouse-invalid-override';

  try {
    await createCategoryFixture(helperRoot, category);
    await seedLatest(storage, category, productId, { weight: '59', dpi: '26000' });
    await seedApprovedOverride(helperRoot, category, productId, 'not-a-number');

    const result = await publishProducts({
      storage,
      config: { categoryAuthorityRoot: helperRoot },
      category,
      productIds: [productId]
    });

    assert.equal(result.published_count, 0);
    assert.equal(result.blocked_count, 1);
    assert.equal(await storage.objectExists(`output/${category}/published/${productId}/current.json`), false);
    assert.equal(String(result.results[0].reason || '').includes('validation'), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
