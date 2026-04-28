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
              appendProcessOutput(lines) {
                globalThis.__wsEventBridgeHarness.processOutput.push(lines);
              },
              setProcessStatus(status) {
                globalThis.__wsEventBridgeHarness.processStatuses.push(status);
              },
            });
          }
        `,
        '../../../stores/eventsStore.ts': `
          export function useEventsStore(selector) {
            return selector({
              appendEvents(events) {
                globalThis.__wsEventBridgeHarness.runtimeEvents.push(events);
              },
            });
          }
        `,
        '../../../stores/operationsStore.ts': `
          export function useOperationsStore() {}
          useOperationsStore.getState = function getState() {
            return {
              appendLlmCall(id, call) {
                globalThis.__wsEventBridgeHarness.operationsCalls.push({ type: 'appendLlmCall', id, call });
              },
              batchAppendCallStreamText(chunks) {
                globalThis.__wsEventBridgeHarness.operationsCalls.push({
                  type: 'batchAppendCallStreamText',
                  chunks: [...chunks.entries()].map(([id, entries]) => [id, entries]),
                });
              },
              batchAppendStreamText(chunks) {
                globalThis.__wsEventBridgeHarness.operationsCalls.push({
                  type: 'batchAppendStreamText',
                  chunks: [...chunks.entries()],
                });
              },
              remove(id) {
                globalThis.__wsEventBridgeHarness.operationsCalls.push({ type: 'remove', id });
              },
              updateLlmCall(id, callIndex, call) {
                globalThis.__wsEventBridgeHarness.operationsCalls.push({ type: 'updateLlmCall', id, callIndex, call });
              },
              upsert(operation) {
                globalThis.__wsEventBridgeHarness.operationsCalls.push({ type: 'upsert', operation });
              },
            };
          };
        `,
        '../../../stores/indexlabStore.ts': `
          export function useIndexLabStore(selector) {
            return selector({
              appendEvents(events) {
                globalThis.__wsEventBridgeHarness.indexLabEvents.push(events);
              },
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
              return {
                confirmFlush() {
                  globalThis.__wsEventBridgeHarness.confirmFlushes += 1;
                },
              };
            },
          };
        `,
        '../../../features/data-change/index.js': `
          export function resolveDataChangeScopedCategories() {
            return ['mouse'];
          }
          export function recordDataChangeInvalidationFlush() {}
          export function createDataChangeInvalidationScheduler() {
            return {
              dispose() {
                globalThis.__wsEventBridgeHarness.dataChangeDisposes += 1;
              },
              flush() {
                globalThis.__wsEventBridgeHarness.dataChangeFlushes += 1;
                return [];
              },
              schedule(payload) {
                globalThis.__wsEventBridgeHarness.dataChangeSchedules.push(payload);
                return [];
              },
            };
          }
        `,
        '../../../features/catalog/api/catalogRowPatch.ts': `
          export function patchCatalogRowsFromDataChange(payload) {
            globalThis.__wsEventBridgeHarness.dataChangePatches.push(payload);
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

function createHarness(overrides = {}) {
  return {
    activeRunId: '',
    confirmFlushes: 0,
    dataChangeDisposes: 0,
    dataChangeFlushes: 0,
    dataChangePatches: [],
    dataChangeSchedules: [],
    effects: [],
    indexLabEvents: [],
    invalidations: [],
    operationsCalls: [],
    processOutput: [],
    processStatuses: [],
    refCursor: 0,
    refs: [],
    runtimeEvents: [],
    subscriptionOptions: null,
    ...overrides,
  };
}

function makeQueryClient() {
  return {
    invalidateQueries(options) {
      globalThis.__wsEventBridgeHarness.invalidations.push(options);
    },
    setQueryData(key, value) {
      globalThis.__wsEventBridgeHarness.queryData = { key, value };
    },
  };
}

function makeOperation(overrides = {}) {
  return {
    id: 'op-1',
    type: 'pif',
    category: 'mouse',
    productId: 'mouse-1',
    productLabel: 'Mouse 1',
    stages: ['Queued', 'Running'],
    currentStageIndex: 0,
    status: 'running',
    startedAt: '2026-04-28T00:00:00.000Z',
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCallCount: 0,
    activeLlmCallCount: 0,
    activeLlmCalls: [],
    ...overrides,
  };
}

function makeDataChange(overrides = {}) {
  return {
    type: 'data-change',
    event: 'catalog-product-updated',
    category: 'mouse',
    categories: ['mouse'],
    domains: ['catalog'],
    ...overrides,
  };
}

test('active IndexLab run changes invalidate runtime ops by exact run id', async () => {
  globalThis.__wsEventBridgeHarness = createHarness({
    activeRunId: 'run-123',
  });

  try {
    const { useWsEventBridge } = await loadUseWsEventBridgeModule();
    const queryClient = makeQueryClient();

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

test('malformed state-mutating WS payloads do not mutate stores or schedule cache work', async () => {
  globalThis.__wsEventBridgeHarness = createHarness();

  try {
    const { useWsEventBridge } = await loadUseWsEventBridgeModule();
    useWsEventBridge({ category: 'mouse', queryClient: makeQueryClient() });

    const cleanupStreamEffect = globalThis.__wsEventBridgeHarness.effects[1]();
    const cleanupDataChangeEffect = globalThis.__wsEventBridgeHarness.effects[2]();
    const { onMessage } = globalThis.__wsEventBridgeHarness.subscriptionOptions;

    onMessage('operations', { action: 'upsert', operation: { id: 123 } });
    onMessage('operations', { action: 'remove', id: 123 });
    onMessage('llm-stream', { operationId: 'op-1', callId: 42, text: 'chunk' });
    onMessage('data-change', makeDataChange({ categories: ['mouse', 7] }));

    cleanupStreamEffect();
    cleanupDataChangeEffect();

    assert.deepEqual(globalThis.__wsEventBridgeHarness.operationsCalls, []);
    assert.equal(globalThis.__wsEventBridgeHarness.dataChangePatches.length, 0);
    assert.equal(globalThis.__wsEventBridgeHarness.dataChangeSchedules.length, 0);
  } finally {
    delete globalThis.__wsEventBridgeHarness;
  }
});

test('valid operations, data-change, and stream WS payloads still reach their handlers', async () => {
  globalThis.__wsEventBridgeHarness = createHarness();

  try {
    const { useWsEventBridge } = await loadUseWsEventBridgeModule();
    useWsEventBridge({ category: 'mouse', queryClient: makeQueryClient() });

    const cleanupStreamEffect = globalThis.__wsEventBridgeHarness.effects[1]();
    const cleanupDataChangeEffect = globalThis.__wsEventBridgeHarness.effects[2]();
    const { onMessage } = globalThis.__wsEventBridgeHarness.subscriptionOptions;

    onMessage('operations', { action: 'upsert', id: 'op-1', operation: makeOperation() });
    onMessage('operations', { action: 'remove', id: 'op-1' });
    onMessage('llm-stream', { operationId: 'op-1', text: 'legacy stream' });
    onMessage('llm-stream', {
      operationId: 'op-1',
      callId: 'call-1',
      text: 'call stream',
      lane: 'view',
      label: 'View',
      channel: 'content',
    });
    onMessage('data-change', makeDataChange());

    cleanupStreamEffect();
    cleanupDataChangeEffect();

    assert.equal(globalThis.__wsEventBridgeHarness.operationsCalls[0].type, 'upsert');
    assert.equal(globalThis.__wsEventBridgeHarness.operationsCalls[1].type, 'remove');
    assert.deepEqual(globalThis.__wsEventBridgeHarness.operationsCalls[2], {
      type: 'batchAppendStreamText',
      chunks: [['op-1', 'legacy stream']],
    });
    assert.equal(globalThis.__wsEventBridgeHarness.operationsCalls[3].type, 'batchAppendCallStreamText');
    assert.equal(globalThis.__wsEventBridgeHarness.operationsCalls[3].chunks[0][0], 'op-1');
    assert.equal(globalThis.__wsEventBridgeHarness.operationsCalls[3].chunks[0][1][0].callId, 'call-1');
    assert.equal(globalThis.__wsEventBridgeHarness.dataChangePatches.length, 1);
    assert.equal(globalThis.__wsEventBridgeHarness.dataChangeSchedules.length, 1);
  } finally {
    delete globalThis.__wsEventBridgeHarness;
  }
});
