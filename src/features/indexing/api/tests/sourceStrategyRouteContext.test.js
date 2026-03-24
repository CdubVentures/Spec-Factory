import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceStrategyRouteContext } from '../sourceStrategyRouteContext.js';

const EXPECTED_KEYS = ['jsonRes', 'readJsonBody', 'config', 'resolveCategoryAlias', 'broadcastWs'];

test('createSourceStrategyRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createSourceStrategyRouteContext(null), TypeError);
  assert.throws(() => createSourceStrategyRouteContext('str'), TypeError);
  assert.throws(() => createSourceStrategyRouteContext([1]), TypeError);
});

test('createSourceStrategyRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createSourceStrategyRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createSourceStrategyRouteContext preserves identity references', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };

  const ctx = createSourceStrategyRouteContext(options);
  for (const k of EXPECTED_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createSourceStrategyRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createSourceStrategyRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
