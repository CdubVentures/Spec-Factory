import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function load() {
  return loadBundledModule(
    'tools/gui-react/src/features/review/state/reviewFocusPruning.ts',
    { prefix: 'review-focus-pruning-' },
  );
}

function product(productId, fields) {
  return {
    product_id: productId,
    fields,
  };
}

test('keeps the Review drawer open when the active product field still exists', async () => {
  const { resolveReviewFocusPrune } = await load();

  assert.deepEqual(
    resolveReviewFocusPrune({
      activeCell: { productId: 'mouse-1', field: 'dpi' },
      products: [product('mouse-1', { dpi: {} })],
      fieldLabel: 'DPI',
    }),
    { shouldClose: false },
  );
});

test('closes the Review drawer with a notice when the active field was deleted', async () => {
  const { resolveReviewFocusPrune } = await load();

  assert.deepEqual(
    resolveReviewFocusPrune({
      activeCell: { productId: 'mouse-1', field: 'dpi' },
      products: [product('mouse-1', { weight: {} })],
      fieldLabel: 'DPI',
    }),
    {
      shouldClose: true,
      reason: 'field-deleted',
      notice: {
        title: 'Review drawer closed',
        message: 'DPI was deleted for the selected product.',
      },
    },
  );
});

test('closes the Review drawer with a notice when the active product was deleted', async () => {
  const { resolveReviewFocusPrune } = await load();

  assert.deepEqual(
    resolveReviewFocusPrune({
      activeCell: { productId: 'mouse-1', field: 'dpi' },
      products: [product('mouse-2', { dpi: {} })],
      fieldLabel: 'DPI',
    }),
    {
      shouldClose: true,
      reason: 'product-deleted',
      notice: {
        title: 'Review drawer closed',
        message: 'The selected product was deleted.',
      },
    },
  );
});

test('does not prune when no Review drawer cell is active', async () => {
  const { resolveReviewFocusPrune } = await load();

  assert.deepEqual(
    resolveReviewFocusPrune({
      activeCell: null,
      products: [product('mouse-1', { dpi: {} })],
      fieldLabel: 'DPI',
    }),
    { shouldClose: false },
  );
});
