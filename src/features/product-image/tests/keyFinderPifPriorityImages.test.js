import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeProductImages } from '../productImageStore.js';
import { resolveKeyFinderPifPriorityImageContext } from '../index.js';

const CATEGORY = 'mouse';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kf-pif-images-'));
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* noop */ }
}

function writeImageFile(root, productId, filename) {
  const dir = path.join(root, productId, 'images');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), ONE_PIXEL_PNG);
}

function makeSpecDb({ viewConfig, defaultColor = 'black', variants = [] } = {}) {
  return {
    getFinderStore: (id) => (id === 'productImageFinder'
      ? { getSetting: (key) => (key === 'viewConfig' ? viewConfig || '' : '') }
      : null),
    getColorEditionFinder: () => ({ default_color: defaultColor }),
    variants: {
      listActive: () => variants,
    },
  };
}

test('resolveKeyFinderPifPriorityImageContext selects default-color eval winners for priority views only', async () => {
  const root = makeRoot();
  const productId = 'kf-pif-priority';
  try {
    for (const filename of ['top-black.png', 'left-black.png', 'bottom-black.png', 'top-white.png']) {
      writeImageFile(root, productId, filename);
    }
    writeProductImages({
      productId,
      productRoot: root,
      data: {
        product_id: productId,
        category: CATEGORY,
        selected: {
          images: [
            {
              filename: 'top-black.png',
              view: 'top',
              variant_id: 'v_black',
              variant_key: 'color:black',
              variant_label: 'Black',
              variant_type: 'color',
              eval_best: true,
              eval_reasoning: 'Best top view.',
              eval_source: 'https://cdn.example/top-black.png',
              bytes: 123,
            },
            {
              filename: 'left-black.png',
              view: 'left',
              variant_id: 'v_black',
              variant_key: 'color:black',
              variant_label: 'Black',
              variant_type: 'color',
              eval_best: true,
              eval_reasoning: 'Best left view.',
              bytes: 456,
            },
            {
              filename: 'bottom-black.png',
              view: 'bottom',
              variant_id: 'v_black',
              variant_key: 'color:black',
              eval_best: true,
            },
            {
              filename: 'top-white.png',
              view: 'top',
              variant_id: 'v_white',
              variant_key: 'color:white',
              variant_label: 'White',
              variant_type: 'color',
              eval_best: true,
            },
          ],
        },
        carousel_slots: {},
      },
    });

    const ctx = await resolveKeyFinderPifPriorityImageContext({
      specDb: makeSpecDb({
        viewConfig: JSON.stringify([
          { key: 'top', priority: true, description: 'Top' },
          { key: 'left', priority: true, description: 'Left' },
          { key: 'bottom', priority: false, description: 'Bottom' },
        ]),
        variants: [
          { variant_id: 'v_black', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'] },
          { variant_id: 'v_white', variant_key: 'color:white', variant_type: 'color', variant_label: 'White', color_atoms: ['white'] },
        ],
      }),
      product: { product_id: productId, category: CATEGORY },
      productRoot: root,
      fieldRule: { ai_assist: { pif_priority_images: { enabled: true } } },
    });

    assert.equal(ctx.enabled, true);
    assert.equal(ctx.status, 'available');
    assert.equal(ctx.variant.variant_id, 'v_black');
    assert.deepEqual(ctx.priorityViews, ['top', 'left']);
    assert.deepEqual(ctx.images.map((img) => [img.view, img.filename, img.source]), [
      ['top', 'top-black.png', 'eval'],
      ['left', 'left-black.png', 'eval'],
    ]);
    assert.equal(ctx.images[0].preview_url, '/api/v1/product-image-finder/mouse/kf-pif-priority/images/top-black.png?v=123');
    assert.equal(ctx.images[0].llm_file_uri.startsWith('data:image/png;base64,'), true);
    assert.equal(ctx.images[0].llm_source_file_uri.endsWith(path.join(productId, 'images', 'top-black.png')), true);
    assert.equal(ctx.images[0].original_url, 'https://cdn.example/top-black.png');
    assert.equal(ctx.images[0].eval_reasoning, 'Best top view.');
  } finally {
    cleanup(root);
  }
});

test('resolveKeyFinderPifPriorityImageContext returns unavailable context when enabled but no images exist', async () => {
  const root = makeRoot();
  try {
    const productId = 'kf-pif-empty';
    const ctx = await resolveKeyFinderPifPriorityImageContext({
      specDb: makeSpecDb({
        viewConfig: JSON.stringify([{ key: 'top', priority: true, description: 'Top' }]),
        variants: [
          { variant_id: 'v_black', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'] },
        ],
      }),
      product: { product_id: productId, category: CATEGORY },
      productRoot: root,
      fieldRule: { ai_assist: { pif_priority_images: { enabled: true } } },
    });

    assert.equal(ctx.enabled, true);
    assert.equal(ctx.status, 'no_images');
    assert.deepEqual(ctx.priorityViews, ['top']);
    assert.deepEqual(ctx.images, []);
    assert.match(ctx.message, /no PIF-evaluated priority images/i);
  } finally {
    cleanup(root);
  }
});

test('resolveKeyFinderPifPriorityImageContext omits context when knob is off', async () => {
  const ctx = await resolveKeyFinderPifPriorityImageContext({
    specDb: makeSpecDb(),
    product: { product_id: 'kf-off', category: CATEGORY },
    fieldRule: { ai_assist: { pif_priority_images: { enabled: false } } },
  });

  assert.deepEqual(ctx, { enabled: false, status: 'disabled', images: [], priorityViews: [] });
});
