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
