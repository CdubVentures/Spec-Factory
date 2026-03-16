import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunRuntimeContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunRuntimeContext maps runProduct runtime bootstrap inputs to createRunRuntime contract keys', () => {
  const buildRunId = () => 'run-0001';

  const context = buildRunRuntimeContext({
    runIdOverride: 'run.override',
    roundContext: { round: 1 },
    config: { runProfile: 'thorough' },
    buildRunId,
  });

  assert.equal(context.runIdOverride, 'run.override');
  assert.deepEqual(context.roundContext, { round: 1 });
  assert.deepEqual(context.config, { runProfile: 'thorough' });
  assert.equal(context.buildRunIdFn, buildRunId);
});
