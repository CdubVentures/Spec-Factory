import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunTraceWriterPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunTraceWriterPhaseCallsiteContext maps runProduct trace-writer callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { runtimeTraceEnabled: true };
  const toBool = (value, fallback) => (value === undefined ? fallback : Boolean(value));
  const createRuntimeTraceWriter = (options) => ({ options });

  const result = buildRunTraceWriterPhaseCallsiteContext({
    storage,
    config,
    runId: 'run.abc123',
    productId: 'mouse-sample',
    toBool,
    createRuntimeTraceWriter,
  });

  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.runId, 'run.abc123');
  assert.equal(result.productId, 'mouse-sample');
  assert.equal(result.toBool, toBool);
  assert.equal(result.createRuntimeTraceWriter, createRuntimeTraceWriter);
});
