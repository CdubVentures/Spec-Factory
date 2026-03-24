import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioRouteContext } from '../studioRouteContext.js';

const INJECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'config', 'HELPER_ROOT', 'OUTPUT_ROOT', 'safeReadJson',
  'safeStat', 'listFiles', 'fs', 'path', 'sessionCache', 'invalidateFieldRulesCache',
  'getSpecDbReady', 'storage', 'loadCategoryConfig', 'startProcess', 'broadcastWs',
  'reviewLayoutByCategory', 'loadProductCatalog',
];

const HELPER_KEYS = [
  'loadFieldStudioMap', 'saveFieldStudioMap', 'validateFieldStudioMap',
  'buildFieldLabelsMap', 'cleanVariant', 'runEnumConsistencyReview',
];

function createOptions(keys) {
  return Object.fromEntries(keys.map((key) => [key, { key }]));
}

test('createStudioRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createStudioRouteContext(null), TypeError);
  assert.throws(() => createStudioRouteContext('str'), TypeError);
  assert.throws(() => createStudioRouteContext([1]), TypeError);
});

test('createStudioRouteContext returns the required injected and helper surface', () => {
  const options = createOptions(INJECTED_KEYS);

  const ctx = createStudioRouteContext(options);

  for (const key of INJECTED_KEYS) {
    assert.equal(ctx[key], options[key], `${key} should preserve the injected reference`);
  }
  for (const key of HELPER_KEYS) {
    assert.equal(typeof ctx[key], 'function', `${key} should be exposed as a helper function`);
  }
});

test('createStudioRouteContext does not forward extra properties', () => {
  const options = {
    ...createOptions(INJECTED_KEYS),
    extra: 'nope',
  };

  const ctx = createStudioRouteContext(options);

  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
