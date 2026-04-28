import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerProductImageFinderRoutes } from '../api/productImageFinderRoutes.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';

const PRODUCT_ID = `pif-route-data-change-${process.pid}-${Date.now()}`;
const CATEGORY = 'mouse';
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

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

function writeProductImagesDocWithCarouselState() {
  const productDir = path.join(defaultProductRoot(), PRODUCT_ID);
  fs.mkdirSync(productDir, { recursive: true });
  const blackTop = {
    view: 'top',
    filename: 'top-black.png',
    variant_key: 'color:black',
    variant_id: 'variant-black',
    eval_best: true,
    eval_reasoning: 'best black',
  };
  const whiteTop = {
    view: 'top',
    filename: 'top-white.png',
    variant_key: 'color:white',
    variant_id: 'variant-white',
    eval_best: true,
    eval_reasoning: 'best white',
  };
  fs.writeFileSync(path.join(productDir, 'product_images.json'), JSON.stringify({
    product_id: PRODUCT_ID,
    category: CATEGORY,
    selected: { images: [blackTop, whiteTop] },
    image_count: 2,
    run_count: 1,
    runs: [{
      run_number: 1,
      ran_at: '2026-04-26T20:00:00.000Z',
      model: 'test-model',
      selected: { images: [{ ...blackTop }, { ...whiteTop }] },
      response: { images: [{ ...blackTop }, { ...whiteTop }] },
    }],
    evaluations: [{ eval_number: 1, variant_key: 'color:black', type: 'view' }],
    carousel_slots: {
      'color:black': { top: 'manual-black.png' },
      'color:white': { top: 'manual-white.png' },
    },
  }, null, 2));
}

function writeProductImagesDocWithProcessableHero() {
  const productDir = path.join(defaultProductRoot(), PRODUCT_ID);
  const imagesDir = path.join(productDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(path.join(imagesDir, 'hero-black.jpg'), ONE_PIXEL_PNG);
  const heroImage = {
    view: 'hero',
    filename: 'hero-black.jpg',
    variant_key: 'color:black',
    variant_id: 'variant-black',
    eval_best: true,
    eval_reasoning: 'best hero before processing',
    hero: true,
    hero_rank: 1,
  };
  fs.writeFileSync(path.join(productDir, 'product_images.json'), JSON.stringify({
    product_id: PRODUCT_ID,
    category: CATEGORY,
    selected: { images: [heroImage] },
    image_count: 1,
    run_count: 1,
    runs: [{
      run_number: 1,
      ran_at: '2026-04-26T20:00:00.000Z',
      model: 'test-model',
      selected: { images: [{ ...heroImage }] },
      response: { images: [{ ...heroImage }] },
    }],
    carousel_slots: {
      'color:black': { hero_1: 'hero-black.jpg' },
    },
  }, null, 2));
}

function writeProductImagesDocWithTwoRunsAndCarouselState() {
  const productDir = path.join(defaultProductRoot(), PRODUCT_ID);
  const imagesDir = path.join(productDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  for (const filename of ['top-black.png', 'top-white.png']) {
    fs.writeFileSync(path.join(imagesDir, filename), ONE_PIXEL_PNG);
  }
  const blackTop = {
    view: 'top',
    filename: 'top-black.png',
    variant_key: 'color:black',
    variant_id: 'variant-black',
    eval_best: true,
    eval_reasoning: 'deleted run winner',
  };
  const whiteTop = {
    view: 'top',
    filename: 'top-white.png',
    variant_key: 'color:white',
    variant_id: 'variant-white',
    eval_best: true,
    eval_reasoning: 'surviving run winner',
  };
  fs.writeFileSync(path.join(productDir, 'product_images.json'), JSON.stringify({
    product_id: PRODUCT_ID,
    category: CATEGORY,
    selected: { images: [blackTop, whiteTop] },
    image_count: 2,
    run_count: 2,
    runs: [
      {
        run_number: 1,
        ran_at: '2026-04-26T20:00:00.000Z',
        model: 'test-model',
        selected: { images: [{ ...blackTop }] },
        response: { images: [{ ...blackTop }] },
      },
      {
        run_number: 2,
        ran_at: '2026-04-26T20:01:00.000Z',
        model: 'test-model',
        selected: { images: [{ ...whiteTop }] },
        response: { images: [{ ...whiteTop }] },
      },
    ],
    carousel_slots: {
      'color:black': { top: 'top-black.png' },
      'color:white': { top: 'top-white.png' },
    },
  }, null, 2));
}

function readProductImagesDoc() {
  return JSON.parse(fs.readFileSync(
    path.join(defaultProductRoot(), PRODUCT_ID, 'product_images.json'),
    'utf8',
  ));
}

function createCtx(requestBody, options = {}) {
  const emitted = [];
  const summaryUpdates = [];
  const summaryUpserts = [];
  const runInserts = [];
  const runJsonUpdates = [];
  const progressUpserts = [];
  const projectionEvents = [];
  let transactionDepth = 0;
  const variants = options.variants ?? [
    {
      variant_id: 'variant-black',
      variant_key: 'color:black',
    },
  ];
  const settings = options.settings ?? {};
  const specDb = {
    db: {
      transaction: (work) => (...args) => {
        projectionEvents.push({ type: 'transaction:begin', txDepth: transactionDepth });
        transactionDepth += 1;
        try {
          return work(...args);
        } finally {
          transactionDepth -= 1;
          projectionEvents.push({ type: 'transaction:commit', txDepth: transactionDepth });
        }
      },
    },
    variants: {
      listActive: () => variants,
    },
    upsertPifVariantProgress: (row) => {
      projectionEvents.push({ type: 'progress', txDepth: transactionDepth });
      progressUpserts.push(row);
    },
    deletePifVariantProgressByProduct: () => {
      projectionEvents.push({ type: 'progress:delete', txDepth: transactionDepth });
    },
    getFinderStore: (moduleId) => {
      assert.equal(moduleId, 'productImageFinder');
      return {
        updateSummaryField: (...args) => {
          projectionEvents.push({ type: 'summaryField', txDepth: transactionDepth });
          summaryUpdates.push(args);
        },
        upsert: (row) => {
          projectionEvents.push({ type: 'summaryUpsert', txDepth: transactionDepth });
          summaryUpserts.push(row);
        },
        insertRun: (row) => {
          projectionEvents.push({ type: 'runInsert', txDepth: transactionDepth });
          runInserts.push(row);
        },
        updateRunJson: (...args) => {
          projectionEvents.push({ type: 'runJsonUpdate', txDepth: transactionDepth });
          runJsonUpdates.push(args);
        },
        removeRun: () => {
          projectionEvents.push({ type: 'runRemove', txDepth: transactionDepth });
        },
        removeAllRuns: () => {
          projectionEvents.push({ type: 'runRemoveAll', txDepth: transactionDepth });
        },
        remove: () => {
          projectionEvents.push({ type: 'summaryRemove', txDepth: transactionDepth });
        },
        getSetting: (key) => settings[key] ?? '',
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
    _runJsonUpdates: runJsonUpdates,
    _progressUpserts: progressUpserts,
    _projectionEvents: projectionEvents,
  };
}

after(() => {
  fs.rmSync(path.join(defaultProductRoot(), PRODUCT_ID), { recursive: true, force: true });
});

describe('productImageFinderRoutes data-change contract', () => {
  it('updates carousel progress before emitting data-change after updating a slot', async () => {
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
    assert.equal(ctx._progressUpserts.length, 1);
    assert.equal(ctx._progressUpserts[0].productId, PRODUCT_ID);
    assert.equal(ctx._progressUpserts[0].variantId, 'variant-black');
    assert.equal(ctx._progressUpserts[0].priorityFilled, 1);
    assert.equal(ctx._progressUpserts[0].imageCount, 0);

    const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
    assert.equal(emitted?.payload?.event, 'product-image-finder-carousel-updated');
    assert.equal(emitted?.payload?.category, CATEGORY);
    assert.deepEqual(emitted?.payload?.entities?.productIds, [PRODUCT_ID]);
    assert.equal(emitted?.payload?.meta?.variantKey, 'color:black');
    assert.equal(emitted?.payload?.meta?.slot, 'top');
  });

  it('updates carousel slot summary and progress inside one SQL transaction', async () => {
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
    const writeEvents = ctx._projectionEvents.filter((event) => (
      event.type === 'summaryField' || event.type === 'progress'
    ));
    assert.deepEqual(writeEvents.map((event) => event.txDepth), [1, 1]);
    assert.deepEqual(ctx._projectionEvents.map((event) => event.type), [
      'transaction:begin',
      'summaryField',
      'progress',
      'transaction:commit',
    ]);
  });

  it('projects optional carousel placeholders as overfill and extra-image progress', async () => {
    writeProductImagesDoc();
    const ctx = createCtx({
      variant_key: 'color:black',
      slot: 'right',
      filename: 'right-black.png',
    }, {
      settings: {
        viewBudget: '["top","left"]',
        carouselScoredViews: '["top","left"]',
        carouselOptionalViews: '["right"]',
        carouselExtraTarget: '3',
        heroEnabled: 'false',
      },
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
    assert.equal(ctx._progressUpserts.length, 1);
    assert.equal(ctx._progressUpserts[0].priorityFilled, 1);
    assert.equal(ctx._progressUpserts[0].priorityTotal, 2);
    assert.equal(ctx._progressUpserts[0].loopFilled, 1);
    assert.equal(ctx._progressUpserts[0].loopTotal, 3);
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

  it('image processing remaps SQL carousel slots and eval state after filename changes', async () => {
    writeProductImagesDocWithProcessableHero();
    const ctx = createCtx({});
    const handler = registerProductImageFinderRoutes(ctx);

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'images', 'hero-black.jpg', 'process'],
      new URLSearchParams(),
      'POST',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.filename, 'hero-black.png');

    const doc = readProductImagesDoc();
    assert.equal(doc.carousel_slots['color:black'].hero_1, 'hero-black.png');
    assert.equal(doc.selected.images[0].eval_reasoning, 'best hero before processing');

    assert.equal(ctx._summaryUpserts.length, 1);
    assert.deepEqual(ctx._summaryUpserts[0].carousel_slots, {
      'color:black': { hero_1: 'hero-black.png' },
    });
    assert.deepEqual(Object.keys(ctx._summaryUpserts[0].eval_state), ['hero-black.png']);
    assert.equal(ctx._summaryUpserts[0].eval_state['hero-black.png'].eval_reasoning, 'best hero before processing');
  });

  it('run delete recomputes PIF SQL carousel and eval state for surviving images', async () => {
    writeProductImagesDocWithTwoRunsAndCarouselState();
    const ctx = createCtx({}, {
      variants: [
        { variant_id: 'variant-black', variant_key: 'color:black' },
        { variant_id: 'variant-white', variant_key: 'color:white' },
      ],
    });
    const handler = registerProductImageFinderRoutes(ctx);

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'runs', '1'],
      new URLSearchParams(),
      'DELETE',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.equal(ctx._summaryUpserts.length, 1);
    assert.deepEqual(ctx._summaryUpserts[0].carousel_slots, {
      'color:white': { top: 'top-white.png' },
    });
    assert.deepEqual(Object.keys(ctx._summaryUpserts[0].eval_state), ['top-white.png']);
    assert.equal(ctx._summaryUpserts[0].eval_state['top-white.png'].eval_reasoning, 'surviving run winner');
    assert.equal(ctx._progressUpserts.length, 2);
    const progressByVariant = new Map(ctx._progressUpserts.map((row) => [row.variantId, row]));
    assert.equal(progressByVariant.get('variant-black').imageCount, 0);
    assert.equal(progressByVariant.get('variant-white').imageCount, 1);
  });

  it('clear-all carousel winners updates projections and emits the carousel-updated event', async () => {
    writeProductImagesDocWithCarouselState();
    const ctx = createCtx({}, {
      variants: [
        { variant_id: 'variant-black', variant_key: 'color:black' },
        { variant_id: 'variant-white', variant_key: 'color:white' },
      ],
    });
    const handler = registerProductImageFinderRoutes(ctx);

    const result = await handler(
      ['product-image-finder', CATEGORY, PRODUCT_ID, 'carousel-winners', 'clear-all'],
      new URLSearchParams(),
      'POST',
      {},
      {},
    );

    assert.equal(result.status, 200);
    assert.deepEqual(result.body.carousel_slots, {});

    const doc = readProductImagesDoc();
    assert.deepEqual(doc.carousel_slots, {});
    assert.deepEqual(doc.evaluations, [{ eval_number: 1, variant_key: 'color:black', type: 'view' }]);
    assert.equal(doc.selected.images[0].eval_best, undefined);
    assert.equal(doc.selected.images[1].eval_best, undefined);
    assert.equal(doc.runs[0].selected.images[0].eval_best, undefined);
    assert.equal(doc.runs[0].response.images[1].eval_best, undefined);

    assert.deepEqual(ctx._summaryUpdates[0], [PRODUCT_ID, 'carousel_slots', '{}']);
    assert.deepEqual(ctx._summaryUpdates[1], [PRODUCT_ID, 'eval_state', '{}']);
    assert.equal(ctx._runJsonUpdates.length, 1);

    assert.equal(ctx._progressUpserts.length, 2);
    for (const row of ctx._progressUpserts) {
      assert.equal(row.priorityFilled, 0);
      assert.equal(row.loopFilled, 0);
      assert.equal(row.heroFilled, 0);
      assert.equal(row.imageCount, 1);
    }

    const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
    assert.equal(emitted?.payload?.event, 'product-image-finder-carousel-updated');
    assert.equal(emitted?.payload?.category, CATEGORY);
    assert.deepEqual(emitted?.payload?.entities?.productIds, [PRODUCT_ID]);
    assert.equal(emitted?.payload?.meta?.scope, 'all');
  });
});
