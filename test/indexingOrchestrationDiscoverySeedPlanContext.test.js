import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoverySeedPlanContext } from '../src/features/indexing/orchestration/index.js';

test('buildDiscoverySeedPlanContext maps runProduct discovery-seed inputs to phase contract keys', () => {
  const normalizeFieldList = (value) => value;
  const context = buildDiscoverySeedPlanContext({
    config: { id: 'cfg' },
    runtimeOverrides: { id: 'runtime' },
    storage: { id: 'storage' },
    category: 'mouse',
    categoryConfig: { id: 'cat' },
    job: { id: 'job' },
    runId: 'run-1',
    logger: { info() {} },
    roundContext: { round: 0 },
    requiredFields: ['name'],
    llmContext: { id: 'llm' },
    frontierDb: { id: 'frontier' },
    traceWriter: { id: 'trace' },
    learningStoreHints: { id: 'hints' },
    planner: { id: 'planner' },
    normalizeFieldList,
  });

  assert.equal(context.category, 'mouse');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.normalizeFieldListFn, normalizeFieldList);
});
