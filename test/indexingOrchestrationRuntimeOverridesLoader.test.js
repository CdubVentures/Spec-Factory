import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeOverridesLoader } from '../src/features/indexing/orchestration/index.js';

test('createRuntimeOverridesLoader resolves control key and caches reads within throttle window', async () => {
  let nowMs = 10_000;
  const readCalls = [];
  const storage = {
    async readJsonOrNull(key) {
      readCalls.push(key);
      return { disable_llm: true, force_high_fields: ['dpi'] };
    },
  };
  const loader = createRuntimeOverridesLoader({
    storage,
    config: {},
    nowFn: () => nowMs,
    readThrottleMs: 3000,
    resolveRuntimeControlKeyFn: () => '_runtime/runtime-control.json',
    defaultRuntimeOverridesFn: () => ({ pause: false, force_high_fields: [] }),
    normalizeRuntimeOverridesFn: (payload = {}) => ({
      pause: Boolean(payload.pause),
      disable_llm: Boolean(payload.disable_llm),
      force_high_fields: Array.isArray(payload.force_high_fields) ? payload.force_high_fields : [],
    }),
  });

  assert.equal(loader.runtimeControlKey, '_runtime/runtime-control.json');
  assert.deepEqual(loader.getRuntimeOverrides(), { pause: false, force_high_fields: [] });

  const first = await loader.loadRuntimeOverrides({ force: true });
  assert.equal(readCalls.length, 1);
  assert.equal(first.disable_llm, true);
  assert.deepEqual(first.force_high_fields, ['dpi']);

  nowMs = 10_500;
  const second = await loader.loadRuntimeOverrides();
  assert.equal(readCalls.length, 1);
  assert.deepEqual(second, first);

  nowMs = 13_500;
  await loader.loadRuntimeOverrides();
  assert.equal(readCalls.length, 2);
});

test('createRuntimeOverridesLoader falls back to defaults when storage read fails', async () => {
  const loader = createRuntimeOverridesLoader({
    storage: {
      async readJsonOrNull() {
        throw new Error('read failed');
      },
    },
    config: {},
    nowFn: () => 42_000,
    resolveRuntimeControlKeyFn: () => '_runtime/runtime-control.json',
    defaultRuntimeOverridesFn: () => ({ pause: false, disable_llm: false }),
    normalizeRuntimeOverridesFn: (payload = {}) => payload,
  });

  const result = await loader.loadRuntimeOverrides({ force: true });
  assert.deepEqual(result, { pause: false, disable_llm: false });
  assert.deepEqual(loader.getRuntimeOverrides(), { pause: false, disable_llm: false });
});
