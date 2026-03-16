import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunCompletedEventContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunCompletedEventContext maps runProduct run_completed emission inputs to phase contract keys', () => {
  const logger = { info() {} };
  const runCompletedPayload = { runId: 'run-1', productId: 'mouse-1' };

  const context = buildRunCompletedEventContext({
    logger,
    runCompletedPayload,
  });

  assert.equal(context.logger, logger);
  assert.equal(context.runCompletedPayload, runCompletedPayload);
});
