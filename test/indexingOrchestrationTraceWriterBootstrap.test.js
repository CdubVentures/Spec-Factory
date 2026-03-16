import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunTraceWriter } from '../src/features/indexing/orchestration/index.js';

test('createRunTraceWriter returns trace writer when runtime tracing is enabled', () => {
  const created = [];
  const marker = { marker: 'trace-writer' };

  const result = createRunTraceWriter({
    storage: { marker: 'storage' },
    config: { runtimeTraceEnabled: true },
    runId: 'run.abc123',
    productId: 'mouse-sample',
    toBoolFn: (value, fallback) => (value === undefined ? fallback : Boolean(value)),
    createRuntimeTraceWriterFn: (options) => {
      created.push(options);
      return marker;
    },
  });

  assert.equal(result, marker);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0], {
    storage: { marker: 'storage' },
    runId: 'run.abc123',
    productId: 'mouse-sample',
  });
});

test('createRunTraceWriter returns null when runtime tracing is disabled', () => {
  const created = [];
  const result = createRunTraceWriter({
    storage: { marker: 'storage' },
    config: { runtimeTraceEnabled: false },
    runId: 'run.abc123',
    productId: 'mouse-sample',
    toBoolFn: (value, fallback) => (value === undefined ? fallback : Boolean(value)),
    createRuntimeTraceWriterFn: (options) => {
      created.push(options);
      return { marker: 'trace-writer' };
    },
  });

  assert.equal(result, null);
  assert.equal(created.length, 0);
});
