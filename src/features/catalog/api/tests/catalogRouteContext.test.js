import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogRouteContext } from '../catalogRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'config', 'storage', 'reconcileOrphans',
  'buildCatalog', 'listProducts', 'catalogAddProduct', 'catalogAddProductsBulk',
  'catalogUpdateProduct', 'catalogRemoveProduct', 'catalogSeedFromCatalog',
  'upsertQueueProduct', 'loadProductCatalog', 'readJsonlEvents', 'fs', 'path',
  'OUTPUT_ROOT', 'sessionCache', 'resolveCategoryAlias', 'listDirs', 'HELPER_ROOT',
  'broadcastWs', 'loadQueueState', 'saveQueueState', 'getSpecDb',
];

const CORE_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'config', 'storage', 'buildCatalog',
  'loadProductCatalog', 'readJsonlEvents', 'fs', 'path', 'OUTPUT_ROOT',
  'sessionCache', 'resolveCategoryAlias', 'listDirs', 'HELPER_ROOT',
  'broadcastWs', 'getSpecDb',
];

test('createCatalogRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createCatalogRouteContext(null), TypeError);
  assert.throws(() => createCatalogRouteContext('str'), TypeError);
  assert.throws(() => createCatalogRouteContext([1]), TypeError);
});

test('createCatalogRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createCatalogRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createCatalogRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createCatalogRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createCatalogRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createCatalogRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
