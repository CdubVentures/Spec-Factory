import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeOpsRunListHarness } from './helpers/runtimeOpsRunListHarness.js';

test('runtime ops page scopes run-list query key and request by category', async () => {
  const harness = await createRuntimeOpsRunListHarness({
    prefix: 'runtime-ops-run-query-scope-',
  });

  try {
    harness.renderPage();

    const runQuery = harness.getRunQuery();
    assert.deepEqual(runQuery?.queryKey, ['indexlab', 'runs', { category: 'mouse', limit: 40 }]);

    await runQuery.queryFn();
    assert.deepEqual(harness.getApiCalls(), ['/indexlab/runs?limit=40&category=mouse']);
  } finally {
    harness.cleanup();
  }
});
