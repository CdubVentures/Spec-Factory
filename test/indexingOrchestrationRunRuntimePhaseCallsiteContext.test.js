import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunRuntimePhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunRuntimePhaseCallsiteContext maps runProduct runtime-bootstrap callsite inputs to context keys', () => {
  const buildRunId = () => 'run-0001';

  const result = buildRunRuntimePhaseCallsiteContext({
    runIdOverride: 'run.override',
    roundContext: { round: 1 },
    config: { runProfile: 'thorough' },
    buildRunId,
  });

  assert.equal(result.runIdOverride, 'run.override');
  assert.deepEqual(result.roundContext, { round: 1 });
  assert.deepEqual(result.config, { runProfile: 'thorough' });
  assert.equal(result.buildRunId, buildRunId);
});
