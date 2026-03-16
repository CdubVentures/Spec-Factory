import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunRuntime } from '../src/features/indexing/orchestration/index.js';

test('createRunRuntime preserves valid runId override and returns production mode', () => {
  const result = createRunRuntime({
    runIdOverride: 'run.abc123',
    roundContext: {},
    config: {},
    buildRunIdFn: () => 'generated-run-0001',
  });

  assert.equal(result.runId, 'run.abc123');
  assert.equal(result.runtimeMode, 'production');

});

test('createRunRuntime falls back to generated runId and returns production mode', () => {
  const result = createRunRuntime({
    runIdOverride: 'short',
    roundContext: null,
    config: {},
    buildRunIdFn: () => 'generated-run-0002',
  });

  assert.equal(result.runId, 'generated-run-0002');
  assert.equal(result.runtimeMode, 'production');

});

test('createRunRuntime ignores legacy accuracyMode and returns production mode', () => {
  const result = createRunRuntime({
    runIdOverride: '',
    roundContext: {},
    config: {},
    buildRunIdFn: () => 'generated-run-0003',
  });

  assert.equal(result.runId, 'generated-run-0003');
  assert.equal(result.runtimeMode, 'production');

});
