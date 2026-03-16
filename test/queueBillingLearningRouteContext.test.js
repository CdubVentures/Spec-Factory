import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueueBillingLearningRouteContext } from '../src/features/indexing/api/queueBillingLearningRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'config', 'storage', 'OUTPUT_ROOT', 'path',
  'getSpecDb', 'buildReviewQueue', 'loadQueueState', 'saveQueueState',
  'upsertQueueProduct', 'broadcastWs', 'safeReadJson', 'safeStat', 'listFiles',
  'loadProductCatalog',
];

const CORE_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'config', 'storage', 'OUTPUT_ROOT', 'path',
  'getSpecDb', 'broadcastWs', 'safeReadJson', 'safeStat', 'listFiles',
  'loadProductCatalog',
];

test('createQueueBillingLearningRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createQueueBillingLearningRouteContext(null), TypeError);
  assert.throws(() => createQueueBillingLearningRouteContext('str'), TypeError);
  assert.throws(() => createQueueBillingLearningRouteContext([1]), TypeError);
});

test('createQueueBillingLearningRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createQueueBillingLearningRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createQueueBillingLearningRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createQueueBillingLearningRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createQueueBillingLearningRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createQueueBillingLearningRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
