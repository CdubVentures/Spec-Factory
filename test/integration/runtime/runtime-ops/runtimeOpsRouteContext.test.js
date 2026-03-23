import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeOpsRouteContext } from '../../../../src/features/indexing/api/runtimeOpsRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'toInt', 'INDEXLAB_ROOT', 'OUTPUT_ROOT', 'config', 'storage',
  'getIndexLabRoot',
  'readIndexLabRunEvents', 'readIndexLabRunSearchProfile', 'readIndexLabRunMeta',
  'readIndexLabRunSourceIndexingPackets', 'resolveIndexLabRunDirectory',
  'processStatus', 'getLastScreencastFrame', 'safeReadJson', 'safeJoin', 'path',
];

const CORE_KEYS = [
  'jsonRes', 'toInt', 'INDEXLAB_ROOT', 'OUTPUT_ROOT', 'config', 'storage',
  'getIndexLabRoot',
  'processStatus', 'getLastScreencastFrame', 'safeReadJson', 'safeJoin', 'path',
];

test('createRuntimeOpsRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createRuntimeOpsRouteContext(null), TypeError);
  assert.throws(() => createRuntimeOpsRouteContext('str'), TypeError);
  assert.throws(() => createRuntimeOpsRouteContext([1]), TypeError);
});

test('createRuntimeOpsRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createRuntimeOpsRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createRuntimeOpsRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createRuntimeOpsRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createRuntimeOpsRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createRuntimeOpsRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
