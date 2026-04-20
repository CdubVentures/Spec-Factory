// RED (WS-4): Pure selector that builds the POST body for /clear-published
// from drawer state. Three scopes: variant-single, variant-all, scalar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function load() {
  return loadBundledModule(
    'tools/gui-react/src/features/review/selectors/clearPayload.ts',
    { prefix: 'clear-payload-' },
  );
}

test('variant-single: {productId, field, variantId}', async () => {
  const { buildClearPayload } = await load();
  const body = buildClearPayload({
    productId: 'mouse-001',
    field: 'release_date',
    variantId: 'v_black',
  });
  assert.deepEqual(body, { productId: 'mouse-001', field: 'release_date', variantId: 'v_black' });
});

test('variant-all: {productId, field, allVariants:true}', async () => {
  const { buildClearPayload } = await load();
  const body = buildClearPayload({
    productId: 'mouse-001',
    field: 'release_date',
    allVariants: true,
  });
  assert.deepEqual(body, { productId: 'mouse-001', field: 'release_date', allVariants: true });
});

test('scalar: {productId, field}', async () => {
  const { buildClearPayload } = await load();
  const body = buildClearPayload({ productId: 'mouse-001', field: 'weight' });
  assert.deepEqual(body, { productId: 'mouse-001', field: 'weight' });
});

test('omits falsy variantId (empty string, undefined, null)', async () => {
  const { buildClearPayload } = await load();
  assert.deepEqual(
    buildClearPayload({ productId: 'p', field: 'f', variantId: '' }),
    { productId: 'p', field: 'f' },
  );
  assert.deepEqual(
    buildClearPayload({ productId: 'p', field: 'f', variantId: undefined }),
    { productId: 'p', field: 'f' },
  );
  assert.deepEqual(
    buildClearPayload({ productId: 'p', field: 'f', variantId: null }),
    { productId: 'p', field: 'f' },
  );
});

test('omits allVariants when false', async () => {
  const { buildClearPayload } = await load();
  assert.deepEqual(
    buildClearPayload({ productId: 'p', field: 'f', allVariants: false }),
    { productId: 'p', field: 'f' },
  );
});

test('rejects variantId and allVariants both set (client-side guard)', async () => {
  const { buildClearPayload } = await load();
  assert.throws(
    () => buildClearPayload({ productId: 'p', field: 'f', variantId: 'v_black', allVariants: true }),
    /mutually exclusive|both.*not allowed/i,
  );
});
