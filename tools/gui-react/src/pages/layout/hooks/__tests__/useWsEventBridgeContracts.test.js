import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadUseWsEventBridgeModule() {
  return loadBundledModule(
    'tools/gui-react/src/pages/layout/hooks/useWsEventBridge.ts',
    {
      prefix: 'use-ws-event-bridge-',
      stubs: {
        react: `
          export function useCallback(fn) {
            return fn;
          }
          export function useEffect(effect) {
            globalThis.__wsEventBridgeHarness.effects.push(effect);
          }
          export function useRef(initialValue) {
            const harness = globalThis.__wsEventBridgeHarness;
            const index = harness.refCursor++;
            if (!harness.refs[index]) {
              harness.refs[index] = { current: initialValue };
            }
            return harness.refs[index];
          }
        `,
        '../../../stores/runtimeStore.ts': `
          export function useRuntimeStore(selector) {
            return selector({
              appendProcessOutput() {},
              setProcessStatus() {},
            });
          }
        `,
        '../../../stores/eventsStore.ts': `
          export function useEventsStore(selector) {
            return selector({ appendEvents() {} });
          }
        `,
        '../../../stores/operationsStore.ts': `
          export function useOperationsStore() {}
          useOperationsStore.getState = function getState() {
            return {
              appendLlmCall() {},
              batchAppendCallStreamText() {},
              batchAppendStreamText() {},
              remove() {},
              updateLlmCall() {},
              upsert() {},
            };
          };
        `,
        '../../../stores/indexlabStore.ts': `
          export function useIndexLabStore(selector) {
            return selector({
              appendEvents() {},
              pickerRunId: globalThis.__wsEventBridgeHarness.activeRunId,
            });
          }
        `,
        '../../../hooks/useWsSubscription.ts': `
          export function useWsSubscription(options) {
            globalThis.__wsEventBridgeHarness.subscriptionOptions = options;
          }
        `,
        '../../../api/client.ts': `
          export const api = {};
        `,
        '../../../stores/runtimeSettingsValueStore.ts': `
          export const useRuntimeSettingsValueStore = {
            getState() {
              return { confirmFlush() {} };
            },
          };
        `,
        '../../../features/data-change/index.js': `
          export function resolveDataChangeScopedCategories() {
            return [];
          }
          export function recordDataChangeInvalidationFlush() {}
          export function createDataChangeInvalidationScheduler() {
            return {
              dispose() {},
              flush() {},
              schedule() {},
            };
          }
        `,
        '../../../features/catalog/api/catalogRowPatch.ts': `
          export function patchCatalogRowsFromDataChange() {
            return Promise.resolve();
          }
          export function shouldSkipCatalogListInvalidation() {
            return false;
          }
        `,
      },
    },
  );
}

test('active IndexLab run changes invalidate runtime ops by exact run id', async () => {
  globalThis.__wsEventBridgeHarness = {
    activeRunId: 'run-123',
    effects: [],
    invalidations: [],
    refCursor: 0,
    refs: [],
    subscriptionOptions: null,
  };

  try {
    const { useWsEventBridge } = await loadUseWsEventBridgeModule();
    const queryClient = {
      invalidateQueries(options) {
        globalThis.__wsEventBridgeHarness.invalidations.push(options);
      },
      setQueryData() {},
    };

    useWsEventBridge({ category: 'mouse', queryClient });
    globalThis.__wsEventBridgeHarness.effects[0]();

    assert.deepEqual(globalThis.__wsEventBridgeHarness.invalidations, [
      { queryKey: ['indexlab', 'run'] },
      { queryKey: ['runtime-ops', 'run-123'] },
      { queryKey: ['indexing', 'domain-checklist'] },
    ]);
  } finally {
    delete globalThis.__wsEventBridgeHarness;
  }
});
