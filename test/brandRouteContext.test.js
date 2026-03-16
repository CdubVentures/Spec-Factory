import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrandRouteContext } from '../src/features/catalog/api/brandRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'config', 'storage', 'loadBrandRegistry', 'saveBrandRegistry',
  'addBrand', 'addBrandsBulk', 'updateBrand', 'removeBrand', 'getBrandsForCategory',
  'seedBrandsFromActiveFiltering', 'renameBrand', 'getBrandImpactAnalysis',
  'resolveCategoryAlias', 'upsertQueueProduct', 'broadcastWs', 'getSpecDb',
  'loadProductCatalog',
];

const CORE_KEYS = [
  'jsonRes', 'readJsonBody', 'config', 'storage', 'resolveCategoryAlias',
  'broadcastWs', 'getSpecDb', 'loadProductCatalog',
];

test('createBrandRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createBrandRouteContext(null), TypeError);
  assert.throws(() => createBrandRouteContext('str'), TypeError);
  assert.throws(() => createBrandRouteContext([1]), TypeError);
});

test('createBrandRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createBrandRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createBrandRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createBrandRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createBrandRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createBrandRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
