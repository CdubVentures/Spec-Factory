import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrandRouteContext } from '../brandRouteContext.js';

const INJECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'config', 'storage', 'resolveCategoryAlias',
  'broadcastWs', 'getSpecDb', 'loadProductCatalog',
];

const HELPER_KEYS = [
  'loadBrandRegistry', 'saveBrandRegistry', 'addBrand', 'addBrandsBulk',
  'updateBrand', 'removeBrand', 'getBrandsForCategory',
  'seedBrandsFromActiveFiltering', 'renameBrand', 'getBrandImpactAnalysis',
  'upsertQueueProduct',
];

function createOptions(keys) {
  return Object.fromEntries(keys.map((key) => [key, { key }]));
}

test('createBrandRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createBrandRouteContext(null), TypeError);
  assert.throws(() => createBrandRouteContext('str'), TypeError);
  assert.throws(() => createBrandRouteContext([1]), TypeError);
});

test('createBrandRouteContext returns the required injected and helper surface', () => {
  const options = createOptions(INJECTED_KEYS);

  const ctx = createBrandRouteContext(options);

  for (const key of INJECTED_KEYS) {
    assert.equal(ctx[key], options[key], `${key} should preserve the injected reference`);
  }
  for (const key of HELPER_KEYS) {
    assert.equal(typeof ctx[key], 'function', `${key} should be exposed as a helper function`);
  }
});

test('createBrandRouteContext does not forward extra properties', () => {
  const options = {
    ...createOptions(INJECTED_KEYS),
    extra: 'nope',
  };

  const ctx = createBrandRouteContext(options);

  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
