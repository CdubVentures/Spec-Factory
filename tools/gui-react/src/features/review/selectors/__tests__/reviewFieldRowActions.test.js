// RED: Review matrix field-column row action contract.
// Ordinary scalar keys expose row-wide Unpublish all/Delete all actions.
// Variant-owned keys only show the SVG signal and never expose row reset.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function load() {
  return loadBundledModule(
    'tools/gui-react/src/features/review/selectors/reviewFieldRowActions.ts',
    { prefix: 'review-field-row-actions-' },
  );
}

test('ordinary scalar key exposes row-wide unpublish and delete actions', async () => {
  const { deriveReviewFieldRowActionState } = await load();
  const state = deriveReviewFieldRowActionState({
    fieldKey: 'polling_rate',
    variantDependent: false,
  });

  assert.equal(state.variantIconVisible, false);
  assert.deepEqual(state.actions.map((action) => action.kind), ['unpublish-all', 'delete-all']);
  assert.deepEqual(state.actions.map((action) => action.label), ['Unpublish all', 'Delete all']);
});

test('variant-dependent key shows variant icon and suppresses destructive row actions', async () => {
  const { deriveReviewFieldRowActionState } = await load();
  const state = deriveReviewFieldRowActionState({
    fieldKey: 'release_date',
    variantDependent: true,
  });

  assert.equal(state.variantIconVisible, true);
  assert.deepEqual(state.actions, []);
});

test('variant generator key shows variant icon even without variantDependent flag', async () => {
  const { deriveReviewFieldRowActionState } = await load();
  const state = deriveReviewFieldRowActionState({
    fieldKey: 'colors',
    variantDependent: false,
  });

  assert.equal(state.variantIconVisible, true);
  assert.deepEqual(state.actions, []);
});

test('delete-target builder maps row actions to the shared destructive modal contract', async () => {
  const { buildReviewFieldRowDeleteTarget } = await load();

  assert.deepEqual(
    buildReviewFieldRowDeleteTarget({
      action: 'unpublish-all',
      fieldKey: 'polling_rate',
      productCount: 12,
    }),
    { kind: 'field-row-unpublish', fieldKey: 'polling_rate', count: 12 },
  );
  assert.deepEqual(
    buildReviewFieldRowDeleteTarget({
      action: 'delete-all',
      fieldKey: 'polling_rate',
      productCount: 12,
    }),
    { kind: 'field-row-delete', fieldKey: 'polling_rate', count: 12 },
  );
});

test('product header actions target only non-variant review keys', async () => {
  const { deriveReviewProductHeaderActionState } = await load();
  const state = deriveReviewProductHeaderActionState({
    rows: [
      { key: 'polling_rate', field_rule: { variant_dependent: false } },
      { key: 'sensor_model', field_rule: {} },
      { key: 'release_date', field_rule: { variant_dependent: true } },
      { key: 'colors', field_rule: { variant_dependent: false } },
    ],
  });

  assert.deepEqual(state.fieldKeys, ['polling_rate', 'sensor_model']);
  assert.equal(state.fieldCount, 2);
  assert.deepEqual(
    state.actions.map((action) => [action.kind, action.label]),
    [
      ['unpublish-non-variant-keys', 'Unpublish keys'],
      ['delete-non-variant-keys', 'Delete key data'],
    ],
  );
});

test('product header delete-target builder maps per-item actions to the shared modal contract', async () => {
  const { buildReviewProductHeaderDeleteTarget } = await load();

  assert.deepEqual(
    buildReviewProductHeaderDeleteTarget({
      action: 'unpublish-non-variant-keys',
      productId: 'mouse-001',
      productLabel: 'Logitech G Pro',
      fieldCount: 8,
    }),
    {
      kind: 'product-nonvariant-unpublish',
      productId: 'mouse-001',
      label: 'Logitech G Pro',
      count: 8,
    },
  );

  assert.deepEqual(
    buildReviewProductHeaderDeleteTarget({
      action: 'delete-non-variant-keys',
      productId: 'mouse-001',
      productLabel: 'Logitech G Pro',
      fieldCount: 8,
    }),
    {
      kind: 'product-nonvariant-delete',
      productId: 'mouse-001',
      label: 'Logitech G Pro',
      count: 8,
    },
  );
});
