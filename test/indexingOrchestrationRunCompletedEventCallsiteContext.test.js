import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunCompletedEventCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunCompletedEventCallsiteContext maps runProduct run_completed emission callsite inputs to context keys', () => {
  const logger = { info() {} };
  const runCompletedPayload = { runId: 'run-1', productId: 'mouse-1' };

  const context = buildRunCompletedEventCallsiteContext({
    logger,
    runCompletedPayload,
  });

  assert.equal(context.logger, logger);
  assert.equal(context.runCompletedPayload, runCompletedPayload);
});
