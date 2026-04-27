import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadOptimismHelpers() {
  return loadBundledModule(
    'tools/gui-react/src/features/product-image-finder/state/pifDeleteOptimism.ts',
    { prefix: 'pif-delete-optimism-' },
  );
}

test('removeImagesFromPifSummary removes deleted filenames from summary images and runs', async () => {
  const { removeImagesFromPifSummary } = await loadOptimismHelpers();
  const summary = {
    product_id: 'p1',
    category: 'mouse',
    images: [
      { view: 'top', filename: 'a.png', variant_key: 'color:black' },
      { view: 'left', filename: 'b.png', variant_key: 'color:black' },
    ],
    image_count: 2,
    run_count: 1,
    last_ran_at: '',
    runs: [{
      run_number: 1,
      ran_at: '',
      model: 'm',
      fallback_used: false,
      selected: {
        images: [
          { view: 'top', filename: 'a.png', variant_key: 'color:black' },
          { view: 'left', filename: 'b.png', variant_key: 'color:black' },
        ],
      },
      response: {},
    }],
  };

  const result = removeImagesFromPifSummary(summary, ['a.png']);

  assert.deepEqual(result.images.map((img) => img.filename), ['b.png']);
  assert.equal(result.image_count, 1);
  assert.deepEqual(result.runs[0].selected.images.map((img) => img.filename), ['b.png']);
});

test('zeroCatalogPifProgress zeroes all or one variant for the affected product only', async () => {
  const { zeroCatalogPifProgress } = await loadOptimismHelpers();
  const rows = [
    {
      productId: 'p1',
      pifVariants: [
        {
          variant_id: 'v-black',
          variant_key: 'color:black',
          variant_label: 'Black',
          color_atoms: ['black'],
          priority_filled: 1,
          priority_total: 3,
          loop_filled: 2,
          loop_total: 3,
          hero_filled: 1,
          hero_target: 3,
          image_count: 4,
        },
        {
          variant_id: 'v-white',
          variant_key: 'color:white',
          variant_label: 'White',
          color_atoms: ['white'],
          priority_filled: 1,
          priority_total: 3,
          loop_filled: 0,
          loop_total: 3,
          hero_filled: 0,
          hero_target: 3,
          image_count: 1,
        },
      ],
    },
    {
      productId: 'p2',
      pifVariants: [{
        variant_id: 'v-other',
        variant_key: 'color:black',
        variant_label: 'Black',
        color_atoms: ['black'],
        priority_filled: 1,
        priority_total: 3,
        loop_filled: 1,
        loop_total: 3,
        hero_filled: 1,
        hero_target: 3,
        image_count: 3,
      }],
    },
  ];

  const variantResult = zeroCatalogPifProgress(rows, { productId: 'p1', variantKey: 'color:black' });
  assert.equal(variantResult[0].pifVariants[0].image_count, 0);
  assert.equal(variantResult[0].pifVariants[0].priority_filled, 0);
  assert.equal(variantResult[0].pifVariants[1].image_count, 1);
  assert.equal(variantResult[1].pifVariants[0].image_count, 3);

  const allResult = zeroCatalogPifProgress(rows, { productId: 'p1' });
  assert.deepEqual(
    allResult[0].pifVariants.map((variant) => [
      variant.priority_filled,
      variant.loop_filled,
      variant.hero_filled,
      variant.image_count,
    ]),
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
  );
});

test('clearPifCarouselSelections clears carousel winner state while preserving images and eval history', async () => {
  const { clearPifCarouselSelections } = await loadOptimismHelpers();
  const pifData = {
    product_id: 'p1',
    category: 'mouse',
    images: [
      { view: 'top', filename: 'black.png', variant_key: 'color:black', variant_id: 'v-black' },
      { view: 'top', filename: 'white.png', variant_key: 'color:white', variant_id: 'v-white' },
    ],
    image_count: 2,
    run_count: 1,
    last_ran_at: '',
    selected: {
      images: [
        { view: 'top', filename: 'black.png', variant_key: 'color:black', variant_id: 'v-black', eval_best: true, eval_reasoning: 'best' },
        { view: 'hero', filename: 'black-hero.png', variant_key: 'color:black', variant_id: 'v-black', hero: true, hero_rank: 1 },
        { view: 'top', filename: 'white.png', variant_key: 'color:white', variant_id: 'v-white', eval_best: true },
      ],
    },
    runs: [{
      run_number: 1,
      ran_at: '',
      model: 'm',
      fallback_used: false,
      selected: {
        images: [
          { view: 'top', filename: 'black.png', variant_key: 'color:black', variant_id: 'v-black', eval_best: true },
          { view: 'top', filename: 'white.png', variant_key: 'color:white', variant_id: 'v-white', eval_best: true },
        ],
      },
      response: {
        images: [
          { view: 'top', filename: 'black.png', variant_key: 'color:black', variant_id: 'v-black', eval_best: true },
          { view: 'top', filename: 'white.png', variant_key: 'color:white', variant_id: 'v-white', eval_best: true },
        ],
      },
    }],
    evaluations: [{ eval_number: 1, variant_key: 'color:black' }],
    carousel_slots: {
      'color:black': { top: 'manual-black.png' },
      'color:white': { top: 'manual-white.png' },
    },
  };

  const variantResult = clearPifCarouselSelections(pifData, { variantKey: 'color:black', variantId: 'v-black' });
  assert.deepEqual(variantResult.carousel_slots, { 'color:white': { top: 'manual-white.png' } });
  assert.equal(variantResult.image_count, 2);
  assert.deepEqual(variantResult.evaluations, [{ eval_number: 1, variant_key: 'color:black' }]);
  assert.equal(variantResult.selected.images[0].eval_best, undefined);
  assert.equal(variantResult.selected.images[1].hero, undefined);
  assert.equal(variantResult.selected.images[2].eval_best, true);
  assert.equal(variantResult.runs[0].selected.images[0].eval_best, undefined);
  assert.equal(variantResult.runs[0].response.images[0].eval_best, undefined);
  assert.equal(variantResult.runs[0].response.images[1].eval_best, true);

  const allResult = clearPifCarouselSelections(pifData);
  assert.deepEqual(allResult.carousel_slots, {});
  assert.equal(allResult.selected.images.every((image) => image.eval_best === undefined && image.hero === undefined), true);
  assert.equal(allResult.images.length, 2);
});

test('zeroCatalogPifCarouselProgress clears overview rings without changing image counts', async () => {
  const { zeroCatalogPifCarouselProgress } = await loadOptimismHelpers();
  const rows = [{
    productId: 'p1',
    pifVariants: [
      {
        variant_id: 'v-black',
        variant_key: 'color:black',
        variant_label: 'Black',
        color_atoms: ['black'],
        priority_filled: 1,
        priority_total: 3,
        loop_filled: 2,
        loop_total: 3,
        hero_filled: 1,
        hero_target: 3,
        image_count: 4,
      },
      {
        variant_id: 'v-white',
        variant_key: 'color:white',
        variant_label: 'White',
        color_atoms: ['white'],
        priority_filled: 1,
        priority_total: 3,
        loop_filled: 0,
        loop_total: 3,
        hero_filled: 0,
        hero_target: 3,
        image_count: 1,
      },
    ],
  }];

  const variantResult = zeroCatalogPifCarouselProgress(rows, { productId: 'p1', variantKey: 'color:black' });
  assert.deepEqual(
    variantResult[0].pifVariants.map((variant) => [
      variant.priority_filled,
      variant.loop_filled,
      variant.hero_filled,
      variant.image_count,
    ]),
    [
      [0, 0, 0, 4],
      [1, 0, 0, 1],
    ],
  );

  const allResult = zeroCatalogPifCarouselProgress(rows, { productId: 'p1' });
  assert.deepEqual(
    allResult[0].pifVariants.map((variant) => [
      variant.priority_filled,
      variant.loop_filled,
      variant.hero_filled,
      variant.image_count,
    ]),
    [
      [0, 0, 0, 4],
      [0, 0, 0, 1],
    ],
  );
});
