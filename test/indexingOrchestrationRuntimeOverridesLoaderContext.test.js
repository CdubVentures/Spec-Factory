import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeOverridesLoaderContext } from '../src/features/indexing/orchestration/index.js';

test('buildRuntimeOverridesLoaderContext maps runProduct runtime-overrides inputs to loader contract keys', () => {
  const resolveRuntimeControlKey = () => '_runtime/runtime-control.json';
  const defaultRuntimeOverrides = () => ({ pause: false });
  const normalizeRuntimeOverrides = (payload = {}) => payload;

  const context = buildRuntimeOverridesLoaderContext({
    storage: { marker: 'storage' },
    config: { marker: 'config' },
    resolveRuntimeControlKey,
    defaultRuntimeOverrides,
    normalizeRuntimeOverrides,
  });

  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, { marker: 'config' });
  assert.equal(context.resolveRuntimeControlKeyFn, resolveRuntimeControlKey);
  assert.equal(context.defaultRuntimeOverridesFn, defaultRuntimeOverrides);
  assert.equal(context.normalizeRuntimeOverridesFn, normalizeRuntimeOverrides);
});
