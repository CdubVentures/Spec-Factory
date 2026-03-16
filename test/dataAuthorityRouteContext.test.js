import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataAuthorityRouteContext } from '../src/features/category-authority/api/dataAuthorityRouteContext.js';

const EXPECTED_KEYS = ['jsonRes', 'config', 'sessionCache', 'getSpecDb'];

test('createDataAuthorityRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createDataAuthorityRouteContext(null), TypeError);
  assert.throws(() => createDataAuthorityRouteContext('str'), TypeError);
  assert.throws(() => createDataAuthorityRouteContext([1]), TypeError);
});

test('createDataAuthorityRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createDataAuthorityRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createDataAuthorityRouteContext preserves identity references', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };

  const ctx = createDataAuthorityRouteContext(options);
  for (const k of EXPECTED_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createDataAuthorityRouteContext does not forward extra properties', () => {
  const options = { jsonRes: () => {}, config: {}, sessionCache: {}, getSpecDb: () => {}, extra: 'nope' };
  const ctx = createDataAuthorityRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
