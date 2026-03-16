import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunLoggerBootstrapContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunLoggerBootstrapContext maps runProduct logger bootstrap inputs to phase contract keys', () => {
  const createEventLogger = () => ({ info() {} });

  const context = buildRunLoggerBootstrapContext({
    storage: { marker: 'storage' },
    config: { runtimeEventsKey: '_runtime/custom-events.jsonl' },
    runId: 'run.abc123',
    createEventLogger,
  });

  assert.deepEqual(context.storage, { marker: 'storage' });
  assert.deepEqual(context.config, { runtimeEventsKey: '_runtime/custom-events.jsonl' });
  assert.equal(context.runId, 'run.abc123');
  assert.equal(context.createEventLoggerFn, createEventLogger);
});
