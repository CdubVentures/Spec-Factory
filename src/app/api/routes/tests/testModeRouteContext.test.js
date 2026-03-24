import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestModeRouteContext } from '../testModeRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'toUnitRatio', 'config', 'storage',
  'HELPER_ROOT', 'OUTPUT_ROOT', 'getSpecDb', 'getSpecDbReady', 'fs', 'path',
  'safeReadJson', 'safeStat', 'listFiles', 'resolveCategoryAlias', 'broadcastWs',
  'buildTrafficLight', 'deriveTrafficLightCounts', 'readLatestArtifacts',
  'analyzeContract', 'buildTestProducts', 'generateTestSourceResults',
  'buildDeterministicSourceResults', 'buildSeedComponentDB', 'buildValidationChecks',
  'loadComponentIdentityPools', 'runTestProduct', 'runComponentReviewBatch',
  'purgeTestModeCategoryState', 'resetTestModeSharedReviewState',
  'resetTestModeProductReviewState', 'addBrand', 'loadBrandRegistry',
  'saveBrandRegistry', 'invalidateFieldRulesCache', 'sessionCache',
];

const CORE_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'toUnitRatio', 'config', 'storage',
  'HELPER_ROOT', 'OUTPUT_ROOT', 'getSpecDb', 'getSpecDbReady', 'fs', 'path',
  'safeReadJson', 'safeStat', 'listFiles', 'resolveCategoryAlias', 'broadcastWs',
  'purgeTestModeCategoryState', 'resetTestModeSharedReviewState',
  'resetTestModeProductReviewState', 'invalidateFieldRulesCache', 'sessionCache',
];

test('createTestModeRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createTestModeRouteContext(null), TypeError);
  assert.throws(() => createTestModeRouteContext('str'), TypeError);
  assert.throws(() => createTestModeRouteContext([1]), TypeError);
});

test('createTestModeRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createTestModeRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createTestModeRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createTestModeRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createTestModeRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createTestModeRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
