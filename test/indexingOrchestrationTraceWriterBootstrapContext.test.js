import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunTraceWriterContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunTraceWriterContext maps runProduct trace-writer inputs to bootstrap contract keys', () => {
  const createRuntimeTraceWriter = () => ({ marker: 'trace' });
  const toBool = (value, fallback) => (value === undefined ? fallback : Boolean(value));
  const context = buildRunTraceWriterContext({
    storage: { marker: 'storage' },
    config: { runtimeTraceEnabled: true },
    runId: 'run.abc123',
    productId: 'mouse-sample',
    toBool,
    createRuntimeTraceWriter,
  });

  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, { runtimeTraceEnabled: true });
  assert.equal(context.runId, 'run.abc123');
  assert.equal(context.productId, 'mouse-sample');
  assert.equal(context.toBoolFn, toBool);
  assert.equal(context.createRuntimeTraceWriterFn, createRuntimeTraceWriter);
});
