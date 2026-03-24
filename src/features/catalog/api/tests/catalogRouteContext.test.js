import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogRouteContext } from '../catalogRouteContext.js';

const INJECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'config', 'storage', 'buildCatalog',
  'loadProductCatalog', 'readJsonlEvents', 'fs', 'path', 'OUTPUT_ROOT',
  'sessionCache', 'resolveCategoryAlias', 'listDirs', 'HELPER_ROOT',
  'broadcastWs', 'getSpecDb',
];

const HELPER_KEYS = [
  'reconcileOrphans', 'listProducts', 'catalogAddProduct', 'catalogAddProductsBulk',
  'catalogUpdateProduct', 'catalogRemoveProduct', 'catalogSeedFromCatalog',
  'upsertQueueProduct', 'loadQueueState', 'saveQueueState',
];

function createOptions(keys) {
  return Object.fromEntries(keys.map((key) => [key, { key }]));
}

test('createCatalogRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createCatalogRouteContext(null), TypeError);
  assert.throws(() => createCatalogRouteContext('str'), TypeError);
  assert.throws(() => createCatalogRouteContext([1]), TypeError);
});

test('createCatalogRouteContext returns the required injected and helper surface', () => {
  const options = createOptions(INJECTED_KEYS);

  const ctx = createCatalogRouteContext(options);

  for (const key of INJECTED_KEYS) {
    assert.equal(ctx[key], options[key], `${key} should preserve the injected reference`);
  }
  for (const key of HELPER_KEYS) {
    assert.equal(typeof ctx[key], 'function', `${key} should be exposed as a helper function`);
  }
});

test('createCatalogRouteContext does not forward extra properties', () => {
  const options = {
    ...createOptions(INJECTED_KEYS),
    extra: 'nope',
  };

  const ctx = createCatalogRouteContext(options);

  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
