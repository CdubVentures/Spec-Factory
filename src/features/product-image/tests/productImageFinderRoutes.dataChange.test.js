import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerProductImageFinderRoutes } from '../api/productImageFinderRoutes.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

const PRODUCT_ID = `pif-route-data-change-${process.pid}-${Date.now()}`;
const CATEGORY = 'mouse';

function writeProductImagesDoc() {
  const productDir = path.join(defaultProductRoot(), PRODUCT_ID);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'product_images.json'), JSON.stringify({
    product_id: PRODUCT_ID,
    category: CATEGORY,
    selected: { images: [] },
    runs: [],
    carousel_slots: {},
  }, null, 2));
}

function writeProductImagesDocWithImages() {
  const productDir = path.join(defaultProductRoot(), PRODUCT_ID);
  const imagesDir = path.join(productDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  for (const filename of ['top-black.png', 'left-black.png']) {
    fs.writeFileSync(path.join(imagesDir, filename), 'image-bytes');
  }
  const topImage = {
    view: 'top',
    filename: 'top-black.png',
    variant_key: 'color:black',
    variant_id: 'variant-black',
  };
  const leftImage = {
    view: 'left',
    filename: 'left-black.png',
    variant_key: 'color:black',
    variant_id: 'variant-black',
  };
  fs.writeFileSync(path.join(productDir, 'product_images.json'), JSON.stringify({
    product_id: PRODUCT_ID,
    category: CATEGORY,
    selected: { images: [topImage, leftImage] },
    image_count: 2,
    run_count: 1,
    runs: [{
      run_number: 1,
      ran_at: '2026-04-26T20:00:00.000Z',
      model: 'test-model',
      selected: { images: [topImage, leftImage] },
      response: { images: [topImage, leftImage] },
    }],
    carousel_slots: {},
  }, null, 2));
}

function readProductImagesDoc() {
  return JSON.parse(fs.readFileSync(
    path.join(defaultProductRoot(), PRODUCT_ID, 'product_images.json'),
    'utf8',
  ));
}

function createCtx(requestBody) {
  const emitted = [];
  const summaryUpdates = [];
  const summaryUpserts = [];
  const runInserts = [];
  const progressUpserts = [];
  const specDb = {
    variants: {
      listActive: () => [
        {
          variant_id: 'variant-black',
          variant_key: 'color:black',
        },
      ],
    },
    upsertPifVariantProgress: (row) => progressUpserts.push(row),
    deletePifVariantProgressByProduct: () => {},
    getFinderStore: (moduleId) => {
      assert.equal(moduleId, 'productImageFinder');
      return {
        updateSummaryField: (...args) => summaryUpdates.push(args),
        upsert: (row) => summaryUpserts.push(row),
        insertRun: (row) => runInserts.push(row),
        getSetting: () => '',
      };
    },
  };

  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => requestBody,
    getSpecDb: (category) => (category === CATEGORY ? specDb : null),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    config: {},
    appDb: {},
    logger: null,
    _emitted: emitted,
    _summaryUpdates: summaryUpdates,
    _summaryUpserts: summaryUpserts,
    _runInserts: runInserts,
    _progressUpserts: progressUpserts,
  };
}

after(() => {
  fs.rmSync(path.join(defaultProductRoot(), PRODUCT_ID), { recursive: true, force: true });
});

describe('productImageFinderRoutes data-change contract', () => {
  it('emits data-change after updating a carousel slot', async () => {
    writeProductImagesDoc();
    const ctx = createCtx({
      variant_key: 'color:black',
      slot: 'top',
      filename: 'top-black.png',
    });
    const handler = registerProductImageFinderRoutes(ctx);

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'carousel-slot'],
      new URLSearchParams(),
      'PATCH',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.deepEqual(ctx._summaryUpdates[0], [
      PRODUCT_ID,
      'carousel_slots',
      JSON.stringify({ 'color:black': { top: 'top-black.png' } }),
    ]);
    const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
    assert.equal(emitted?.payload?.event, 'product-image-finder-carousel-updated');
    assert.equal(emitted?.payload?.category, CATEGORY);
    assert.deepEqual(emitted?.payload?.entities?.productIds, [PRODUCT_ID]);
    assert.equal(emitted?.payload?.meta?.variantKey, 'color:black');
    assert.equal(emitted?.payload?.meta?.slot, 'top');
  });

  it('bulk image delete rewrites PIF state once and recomputes Overview progress', async () => {
    writeProductImagesDocWithImages();
    const ctx = createCtx({ filenames: ['top-black.png'] });
    const handler = registerProductImageFinderRoutes(ctx);

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'images'],
      new URLSearchParams(),
      'DELETE',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.deleted, ['top-black.png']);

    const doc = readProductImagesDoc();
    assert.deepEqual(
      doc.selected.images.map((img) => img.filename),
      ['left-black.png'],
    );
    assert.deepEqual(
      doc.runs[0].selected.images.map((img) => img.filename),
      ['left-black.png'],
    );
    assert.deepEqual(
      doc.runs[0].response.images.map((img) => img.filename),
      ['left-black.png'],
    );

    assert.equal(ctx._summaryUpserts.length, 1);
    assert.equal(ctx._summaryUpserts[0].image_count, 1);
    assert.equal(ctx._runInserts.length, 1);
    assert.equal(ctx._runInserts[0].selected.images.length, 1);

    assert.equal(ctx._progressUpserts.length, 1);
    assert.equal(ctx._progressUpserts[0].productId, PRODUCT_ID);
    assert.equal(ctx._progressUpserts[0].variantId, 'variant-black');
    assert.equal(ctx._progressUpserts[0].imageCount, 1);

    const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
    assert.equal(emitted?.payload?.event, 'product-image-finder-image-deleted');
    assert.equal(emitted?.payload?.category, CATEGORY);
    assert.deepEqual(emitted?.payload?.entities?.productIds, [PRODUCT_ID]);
    assert.deepEqual(emitted?.payload?.meta?.deletedImages, ['top-black.png']);
  });

  it('single image delete also recomputes Overview progress immediately', async () => {
    writeProductImagesDocWithImages();
    const ctx = createCtx({});
    const handler = registerProductImageFinderRoutes(ctx);

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'images', 'top-black.png'],
      new URLSearchParams(),
      'DELETE',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.deleted, 'top-black.png');
    assert.equal(ctx._progressUpserts.length, 1);
    assert.equal(ctx._progressUpserts[0].imageCount, 1);

    const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
    assert.equal(emitted?.payload?.event, 'product-image-finder-image-deleted');
    assert.deepEqual(emitted?.payload?.meta?.deletedImage, 'top-black.png');
  });
});
