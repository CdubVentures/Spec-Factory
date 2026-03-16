import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunLoggerBootstrapPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunLoggerBootstrapPhaseCallsiteContext maps runProduct logger-bootstrap callsite inputs to context keys', () => {
  const storage = { marker: 'storage' };
  const config = { runtimeEventsKey: '_runtime/custom-events.jsonl' };
  const createEventLogger = (options) => ({ options });

  const result = buildRunLoggerBootstrapPhaseCallsiteContext({
    storage,
    config,
    runId: 'run.abc123',
    createEventLogger,
  });

  assert.equal(result.storage, storage);
  assert.equal(result.config, config);
  assert.equal(result.runId, 'run.abc123');
  assert.equal(result.createEventLogger, createEventLogger);
});
