import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioRouteContext } from '../studioRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'config', 'HELPER_ROOT', 'OUTPUT_ROOT', 'safeReadJson',
  'safeStat', 'listFiles', 'fs', 'path', 'sessionCache', 'loadFieldStudioMap',
  'saveFieldStudioMap', 'validateFieldStudioMap', 'invalidateFieldRulesCache',
  'buildFieldLabelsMap', 'getSpecDbReady', 'storage', 'loadCategoryConfig',
  'startProcess', 'broadcastWs', 'reviewLayoutByCategory', 'loadProductCatalog',
  'cleanVariant', 'runEnumConsistencyReview',
];

const CORE_KEYS = [
  'jsonRes', 'readJsonBody', 'config', 'HELPER_ROOT', 'OUTPUT_ROOT', 'safeReadJson',
  'safeStat', 'listFiles', 'fs', 'path', 'sessionCache', 'invalidateFieldRulesCache',
  'getSpecDbReady', 'storage', 'loadCategoryConfig', 'startProcess', 'broadcastWs',
  'reviewLayoutByCategory', 'loadProductCatalog',
];

test('createStudioRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createStudioRouteContext(null), TypeError);
  assert.throws(() => createStudioRouteContext('str'), TypeError);
  assert.throws(() => createStudioRouteContext([1]), TypeError);
});

test('createStudioRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createStudioRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createStudioRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createStudioRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createStudioRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createStudioRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
