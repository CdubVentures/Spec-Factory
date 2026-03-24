import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestModeRouteContext } from '../testModeRouteContext.js';

const INJECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'toUnitRatio', 'config', 'storage',
  'HELPER_ROOT', 'OUTPUT_ROOT', 'getSpecDb', 'getSpecDbReady', 'fs', 'path',
  'safeReadJson', 'safeStat', 'listFiles', 'resolveCategoryAlias', 'broadcastWs',
  'purgeTestModeCategoryState', 'resetTestModeSharedReviewState',
  'resetTestModeProductReviewState', 'invalidateFieldRulesCache', 'sessionCache',
];

const HELPER_KEYS = [
  'buildTrafficLight', 'deriveTrafficLightCounts', 'readLatestArtifacts',
  'analyzeContract', 'buildTestProducts', 'generateTestSourceResults',
  'buildDeterministicSourceResults', 'buildSeedComponentDB',
  'buildValidationChecks', 'loadComponentIdentityPools', 'runTestProduct',
  'runComponentReviewBatch', 'addBrand', 'loadBrandRegistry', 'saveBrandRegistry',
];

function createOptions(keys) {
  return Object.fromEntries(keys.map((key) => [key, { key }]));
}

test('createTestModeRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createTestModeRouteContext(null), TypeError);
  assert.throws(() => createTestModeRouteContext('str'), TypeError);
  assert.throws(() => createTestModeRouteContext([1]), TypeError);
});

test('createTestModeRouteContext returns the required injected and helper surface', () => {
  const options = createOptions(INJECTED_KEYS);

  const ctx = createTestModeRouteContext(options);

  for (const key of INJECTED_KEYS) {
    assert.equal(ctx[key], options[key], `${key} should preserve the injected reference`);
  }
  for (const key of HELPER_KEYS) {
    assert.equal(typeof ctx[key], 'function', `${key} should be exposed as a helper function`);
  }
});

test('createTestModeRouteContext does not forward extra properties', () => {
  const options = {
    ...createOptions(INJECTED_KEYS),
    extra: 'nope',
  };

  const ctx = createTestModeRouteContext(options);

  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
