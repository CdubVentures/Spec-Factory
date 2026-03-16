import test from 'node:test';
import assert from 'node:assert/strict';
import { emitRunCompletedEvent } from '../src/features/indexing/orchestration/index.js';

test('emitRunCompletedEvent emits run_completed telemetry payload', () => {
  const calls = [];
  const logger = {
    info(eventName, payload) {
      calls.push({ eventName, payload });
    },
  };
  const runCompletedPayload = { runId: 'run-1', productId: 'mouse-1' };

  emitRunCompletedEvent({
    logger,
    runCompletedPayload,
  });

  assert.deepEqual(calls, [
    { eventName: 'run_completed', payload: runCompletedPayload },
  ]);
});
