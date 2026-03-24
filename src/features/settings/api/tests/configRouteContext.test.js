import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfigRouteContext } from '../configRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'config', 'configGate', 'toInt', 'collectLlmModels', 'llmProviderFromModel',
  'resolvePricingForModel', 'resolveTokenProfileForModel', 'resolveLlmRoleDefaults',
  'resolveLlmKnobDefaults', 'llmRoutingSnapshot', 'buildLlmMetrics',
  'buildIndexingDomainChecklist', 'buildReviewMetrics', 'getSpecDb', 'storage',
  'OUTPUT_ROOT', 'broadcastWs', 'HELPER_ROOT', 'runDataStorageState',
];

const CORE_KEYS = [
  'jsonRes', 'readJsonBody', 'config', 'configGate', 'toInt', 'getSpecDb', 'storage',
  'OUTPUT_ROOT', 'broadcastWs', 'HELPER_ROOT', 'runDataStorageState',
];

test('createConfigRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createConfigRouteContext(null), TypeError);
  assert.throws(() => createConfigRouteContext('str'), TypeError);
  assert.throws(() => createConfigRouteContext([1]), TypeError);
});

test('createConfigRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createConfigRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createConfigRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createConfigRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createConfigRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createConfigRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
