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

function createCtx(requestBody) {
  const emitted = [];
  const summaryUpdates = [];
  const specDb = {
    getFinderStore: (moduleId) => {
      assert.equal(moduleId, 'productImageFinder');
      return {
        updateSummaryField: (...args) => summaryUpdates.push(args),
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
});
