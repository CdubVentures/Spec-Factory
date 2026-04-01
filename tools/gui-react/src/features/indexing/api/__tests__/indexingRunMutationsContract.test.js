import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadIndexingRunMutationsModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/indexing/api/indexingRunMutations.ts',
    {
      prefix: 'indexing-run-mutations-',
      stubs: {
        '@tanstack/react-query': `
          export function useMutation(config) {
            globalThis.__indexingRunMutationsHarness.mutationConfigs.push(config);
            return {
              isPending: false,
              isSuccess: false,
              isError: false,
              error: null,
              mutate(payload) {
                globalThis.__indexingRunMutationsHarness.mutateCalls.push(payload);
                if (typeof config.onMutate === 'function') {
                  return config.onMutate(payload);
                }
                return undefined;
              },
            };
          }
        `,
        '../../../api/client.ts': `
          export const api = {
            post() {
              throw new Error('api.post should not run during onMutate contract tests');
            },
          };
        `,
        './indexingRunStartParsedValues.ts': `
          export function deriveIndexingRunStartParsedValues() {
            return {};
          }
        `,
        './indexingRunStartPayload.ts': `
          export function buildIndexingRunStartPayload() {
            return {};
          }
        `,
        './indexingRunMutationCallbacks.ts': `
          export function handleStartIndexLabMutationError() {}
          export function handleStartIndexLabMutationSuccess() {}
        `,
        './indexingRunId.ts': `
          export function buildRequestedRunId() {
            return 'mouse-logitech-g-pro-wireless-run-1234567';
          }
        `,
      },
    },
  );
}

test('start mutation invalidates the full indexlab run-list family for structured picker keys', async () => {
  globalThis.__indexingRunMutationsHarness = {
    invalidations: [],
    removedQueries: [],
    mutateCalls: [],
    mutationConfigs: [],
    selectedRunIds: [],
    clearedRunIds: [],
  };

  try {
    const { useIndexingRunMutations } = await loadIndexingRunMutationsModule();
    const queryClient = {
      removeQueries(options) {
        globalThis.__indexingRunMutationsHarness.removedQueries.push(options);
      },
      invalidateQueries(options) {
        globalThis.__indexingRunMutationsHarness.invalidations.push(options);
        return Promise.resolve({ ok: true });
      },
    };

    const hook = useIndexingRunMutations({
      runtimeSettingsPayload: /** @type {never} */ ({}),
      runtimeSettingsBaseline: /** @type {never} */ ({}),
      runControlPayload: {},
      category: 'mouse',
      singleProductId: 'logitech-g-pro-wireless',
      selectedIndexLabRunId: '',
      clearProcessOutput() {},
      setClearedRunViewId() {},
      clearIndexLabRun(runId) {
        globalThis.__indexingRunMutationsHarness.clearedRunIds.push(runId);
      },
      removeRunScopedQueries() {},
      queryClient,
      setSelectedIndexLabRunId(runId) {
        globalThis.__indexingRunMutationsHarness.selectedRunIds.push(runId);
      },
      publishProcessStatus() {},
      refreshAll() {},
      processRunning: false,
      processStatus: undefined,
      runtimeSettingsAuthorityReady: true,
      runtimeSettingsLoading: false,
      replayPending: false,
      preflightCheck() {
        return { valid: true, errors: [] };
      },
    });

    hook.handleRunIndexLab();

    assert.deepEqual(globalThis.__indexingRunMutationsHarness.mutateCalls, [
      { requestedRunId: 'mouse-logitech-g-pro-wireless-run-1234567' },
    ]);
    assert.deepEqual(globalThis.__indexingRunMutationsHarness.selectedRunIds, [
      'mouse-logitech-g-pro-wireless-run-1234567',
    ]);
    assert.deepEqual(
      globalThis.__indexingRunMutationsHarness.invalidations.find((entry) =>
        JSON.stringify(entry.queryKey) === JSON.stringify(['indexlab', 'runs'])
      ),
      { queryKey: ['indexlab', 'runs'] },
    );
  } finally {
    delete globalThis.__indexingRunMutationsHarness;
  }
});
