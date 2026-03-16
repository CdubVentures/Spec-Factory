import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeOverridesLoaderPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRuntimeOverridesLoaderPhaseCallsiteContext maps runProduct runtime-overrides callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { marker: 'config' };
  const resolveRuntimeControlKey = () => '_runtime/runtime-control.json';
  const defaultRuntimeOverrides = () => ({ pause: false });
  const normalizeRuntimeOverrides = (payload = {}) => payload;

  const result = buildRuntimeOverridesLoaderPhaseCallsiteContext({
    storage,
    config,
    resolveRuntimeControlKey,
    defaultRuntimeOverrides,
    normalizeRuntimeOverrides,
  });

  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.resolveRuntimeControlKey, resolveRuntimeControlKey);
  assert.equal(result.defaultRuntimeOverrides, defaultRuntimeOverrides);
  assert.equal(result.normalizeRuntimeOverrides, normalizeRuntimeOverrides);
});
