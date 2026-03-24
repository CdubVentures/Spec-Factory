import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../test/helpers/loadBundledModule.js';

function createQueryClient() {
  const calls = [];
  return {
    calls,
    setQueryData(queryKey, value) {
      calls.push({ kind: 'setQueryData', queryKey, value });
    },
    invalidateQueries(options) {
      calls.push({ kind: 'invalidateQueries', queryKey: options.queryKey, exact: options.exact, type: options.type });
      return Promise.resolve({ ok: true, queryKey: options.queryKey });
    },
    removeQueries(options) {
      calls.push({ kind: 'removeQueries', queryKey: options.queryKey, exact: options.exact });
    },
    refetchQueries(options) {
      calls.push({ kind: 'refetchQueries', queryKey: options.queryKey, type: options.type });
      return Promise.resolve({ ok: true, queryKey: options.queryKey });
    },
  };
}

test('run selection prefers completed runs with ready artifacts and keeps valid active selections', async () => {
  const { deriveNewestCompletedRunId, deriveRunAutoSelectionDecision } = await loadBundledModule(
    'tools/gui-react/src/features/indexing/state/indexingRunSelection.ts',
    { prefix: 'indexing-run-selection-' },
  );

  const runs = [
    { run_id: 'run-latest-missing', status: 'completed', has_needset: false, has_search_profile: true },
    { run_id: 'run-ready', status: 'completed', has_needset: true, has_search_profile: true },
    { run_id: 'run-older', status: 'completed', has_needset: true, has_search_profile: true },
  ];

  assert.equal(deriveNewestCompletedRunId(runs), 'run-ready');

  assert.deepEqual(
    deriveRunAutoSelectionDecision({
      indexlabRuns: runs,
      selectedIndexLabRunId: 'run-ready',
      processStatusRunId: 'run-active',
      isProcessRunning: true,
    }),
    { type: 'keep' },
  );

  assert.deepEqual(
    deriveRunAutoSelectionDecision({
      indexlabRuns: runs,
      selectedIndexLabRunId: 'missing-run',
      processStatusRunId: 'run-active',
      isProcessRunning: true,
    }),
    { type: 'set', runId: 'run-active' },
  );

  assert.deepEqual(
    deriveRunAutoSelectionDecision({
      indexlabRuns: runs,
      selectedIndexLabRunId: 'missing-run',
      processStatusRunId: '',
      isProcessRunning: false,
    }),
    { type: 'set', runId: 'run-ready' },
  );
});

test('run view actions publish status and refresh both shared and run-scoped query families', async () => {
  const {
    publishProcessStatus,
    refreshIndexingPageData,
    removeRunScopedQueries,
    invalidateRunScopedQueries,
  } = await loadBundledModule(
    'tools/gui-react/src/features/indexing/state/indexingRunViewActions.ts',
    { prefix: 'indexing-run-view-actions-' },
  );

  const queryClient = createQueryClient();
  const published = [];
  const status = { running: true, run_id: 'run-123', runId: 'run-123' };

  publishProcessStatus({
    status,
    queryClient,
    setRuntimeProcessStatus(next) {
      published.push(next);
    },
  });

  await refreshIndexingPageData({
    queryClient,
    category: 'mouse',
    selectedIndexLabRunId: 'run-123',
  });
  removeRunScopedQueries({ queryClient, runId: 'run-123' });
  await invalidateRunScopedQueries({ queryClient, runId: 'run-123' });

  assert.deepEqual(published, [status]);
  assert.deepEqual(
    queryClient.calls.find((entry) => entry.kind === 'setQueryData'),
    { kind: 'setQueryData', queryKey: ['processStatus'], value: status },
  );

  const invalidatedKeys = queryClient.calls
    .filter((entry) => entry.kind === 'invalidateQueries')
    .map((entry) => JSON.stringify(entry.queryKey));
  const removedKeys = queryClient.calls
    .filter((entry) => entry.kind === 'removeQueries')
    .map((entry) => JSON.stringify(entry.queryKey));

  assert.equal(invalidatedKeys.includes(JSON.stringify(['runtime-ops'])), true);
  assert.equal(invalidatedKeys.includes(JSON.stringify(['runtime-ops', 'run-123'])), true);
  assert.equal(invalidatedKeys.includes(JSON.stringify(['indexlab', 'run', 'run-123', 'events'])), true);
  assert.equal(invalidatedKeys.includes(JSON.stringify(['indexing', 'domain-checklist'])), true);
  assert.deepEqual(
    queryClient.calls.find((entry) =>
      entry.kind === 'invalidateQueries'
      && JSON.stringify(entry.queryKey) === JSON.stringify(['indexlab', 'runs'])
    ),
    { kind: 'invalidateQueries', queryKey: ['indexlab', 'runs'], exact: undefined, type: undefined },
  );
  assert.equal(removedKeys.includes(JSON.stringify(['indexlab', 'run', 'run-123', 'events'])), true);
  assert.equal(removedKeys.includes(JSON.stringify(['runtime-ops', 'run-123'])), true);
  assert.equal(
    queryClient.calls.some((entry) => entry.kind === 'refetchQueries' && JSON.stringify(entry.queryKey) === JSON.stringify(['indexlab', 'run'])),
    true,
  );
});

test('start-mutation callbacks restore previous run on error and prefer status run id on success', async () => {
  const { handleStartIndexLabMutationError, handleStartIndexLabMutationSuccess } = await loadBundledModule(
    'tools/gui-react/src/features/indexing/api/indexingRunMutationCallbacks.ts',
    { prefix: 'indexing-run-mutation-callbacks-' },
  );

  const selectedRunIds = [];
  const published = [];
  const refreshed = [];

  handleStartIndexLabMutationError({
    context: { previousRunId: 'legacy-run' },
    setSelectedIndexLabRunId(runId) {
      selectedRunIds.push(`error:${runId}`);
    },
  });

  handleStartIndexLabMutationSuccess({
    status: { running: true, run_id: 'live-run-456', runId: 'live-run-456' },
    variables: { requestedRunId: 'requested-run-456' },
    setSelectedIndexLabRunId(runId) {
      selectedRunIds.push(`success:${runId}`);
    },
    publishProcessStatus(statusValue) {
      published.push(statusValue);
    },
    refreshAll() {
      refreshed.push('done');
    },
  });

  handleStartIndexLabMutationSuccess({
    status: { running: true, run_id: '', runId: '' },
    variables: { requestedRunId: 'requested-fallback' },
    setSelectedIndexLabRunId(runId) {
      selectedRunIds.push(`fallback:${runId}`);
    },
    publishProcessStatus(statusValue) {
      published.push(statusValue);
    },
    refreshAll() {
      refreshed.push('fallback');
    },
  });

  assert.deepEqual(selectedRunIds, [
    'error:legacy-run',
    'success:live-run-456',
    'fallback:requested-fallback',
  ]);
  assert.equal(published.length, 2);
  assert.deepEqual(refreshed, ['done', 'fallback']);
});
