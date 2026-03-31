import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';
import {
  createRuntimeOpsRunListHarness,
  flattenText,
} from './helpers/runtimeOpsRunListHarness.js';

function renderElement(node) {
  if (Array.isArray(node)) {
    return node.map(renderElement);
  }
  if (node == null || typeof node !== 'object') {
    return node;
  }
  if (typeof node.type === 'function') {
    return renderElement(node.type(node.props || {}));
  }
  const nextChildren = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderElement(node.props.children)
    : node.props?.children;
  return {
    ...node,
    props: {
      ...(node.props || {}),
      children: nextChildren,
    },
  };
}

async function loadRuntimeOpsPageModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx', {
    prefix: 'runtime-ops-page-contracts-',
    stubs: {
      react: `
        export function useState(initialValue) {
          const value = typeof initialValue === 'function' ? initialValue() : initialValue;
          return [value, () => {}];
        }
        export function useMemo(factory) {
          return factory();
        }
        export function useEffect(effect) {
          effect();
        }
      `,
      'react/jsx-runtime': `
        export function jsx(type, props) {
          return { type, props: props || {} };
        }
        export const jsxs = jsx;
        export const Fragment = Symbol.for('fragment');
      `,
      '@tanstack/react-query': `
        export function useQuery(options) {
          const key = JSON.stringify(options?.queryKey || []);
          if (key === '["processStatus"]') {
            return { data: { running: false, run_id: null, startedAt: null } };
          }
          if (key.includes('"indexlab"') && key.includes('"runs"')) {
            return {
              data: {
                runs: [
                  { run_id: 'run-123', category: 'mouse', product_id: 'mouse-razer-viper-v3-pro', started_at: '2026-03-11T00:00:00.000Z', ended_at: '2026-03-11T00:10:00.000Z', status: 'completed', storage_origin: 'local', picker_label: 'Mouse \\u2022 Razer Viper V3 Pro - run-123' },
                  { run_id: 'run-456', category: 'mouse', product_id: 'mouse-logitech-g-pro-x-superlight-2', started_at: '2026-03-10T00:00:00.000Z', ended_at: '2026-03-10T00:10:00.000Z', status: 'completed', storage_origin: 'local', picker_label: 'Mouse \\u2022 Logitech G Pro X Superlight 2 - run-456' },
                ],
              },
            };
          }
          if (String(key).includes('"workers"')) {
            return { data: { workers: [{ worker_id: 'fetch-3' }] } };
          }
          return { data: undefined };
        }
        export function useMutation() {
          return { mutate() {}, mutateAsync: async () => ({}), isPending: false };
        }
        export function useQueryClient() {
          return { invalidateQueries() {}, removeQueries() {} };
        }
      `,
      '../../../api/client': `
        export const api = {
          get: async () => ({}),
        };
      `,
      '../../../stores/uiStore': `
        export function useUiStore(selector) {
          return selector({ category: 'mouse' });
        }
      `,
      '../../../stores/tabStore': `
        export function usePersistedTab(key) {
          const calls = globalThis.__runtimeOpsSelectionHarness.calls;
          calls.push({ kind: 'tab', key });
          return ['workers', () => {}];
        }
        export function usePersistedNullableTab(key) {
          const calls = globalThis.__runtimeOpsSelectionHarness.calls;
          calls.push({ kind: 'nullable', key });
          return [null, () => {}];
        }
      `,
      '../../indexing/state/indexlabStore': `
        export function useIndexLabStore(selector) {
          return selector({
            pickerRunId: globalThis.__runtimeOpsSelectionHarness.runId,
            setPickerRunId() {},
          });
        }
      `,
      '../selectors/runActivityScopeHelpers.js': `
        export function resolveRunActiveScope() {
          return false;
        }
      `,
      '../panels/overview/MetricsRail': `
        export function MetricsRail() {
          return null;
        }
      `,
      '../panels/overview/OverviewTab': `
        export function OverviewTab() {
          return null;
        }
      `,
      '../panels/workers/WorkersTab': `
        export function WorkersTab() {
          return null;
        }
      `,
      '../panels/overview/DocumentsTab': `
        export function DocumentsTab() {
          return null;
        }
      `,
      '../panels/overview/ExtractionTab': `
        export function ExtractionTab() {
          return null;
        }
      `,
      './RuntimeOpsRunPicker': `
        export function RuntimeOpsRunPicker() {
          return null;
        }
      `,
    },
  });
}

function captureSelectedWorkerPersistenceKey(RuntimeOpsPage, runId) {
  globalThis.__runtimeOpsSelectionHarness.runId = runId;
  globalThis.__runtimeOpsSelectionHarness.calls = [];
  renderElement(RuntimeOpsPage());
  const call = globalThis.__runtimeOpsSelectionHarness.calls.find(
    (entry) => entry.kind === 'nullable' && String(entry.key || '').startsWith('runtimeOps:workers:selectedWorker:'),
  );
  return call?.key || null;
}

test('runtime ops page synthesizes a live fallback row while run history is still loading', async () => {
  const harness = await createRuntimeOpsRunListHarness({
    prefix: 'runtime-ops-page-live-fallback-',
    activeScope: true,
    processStatusResult: {
      data: {
        running: true,
        run_id: '20260318061504-16a0b3',
        runId: '20260318061504-16a0b3',
        startedAt: '2026-03-18T06:15:04.000Z',
        category: 'mouse',
        product_id: 'mouse-razer-viper-v3-pro-white',
        productId: 'mouse-razer-viper-v3-pro-white',
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: 'White',
        storage_destination: 'local',
        storageDestination: 'local',
      },
      isLoading: false,
      isFetching: false,
    },
    runsQueryResult: {
      data: undefined,
      isLoading: true,
      isFetching: true,
    },
    renderPicker(props) {
      return {
        type: 'div',
        props: {
          children: [props.runs?.[0] ? 'picker-ready' : 'picker-missing'],
        },
      };
    },
  });

  try {
    const tree = harness.renderPage();
    const text = flattenText(tree);
    const pickerProps = harness.getPickerProps();

    assert.equal(pickerProps?.runs?.length, 1);
    assert.equal(pickerProps?.runs?.[0]?.picker_label, 'Mouse \u2022 Razer Viper V3 Pro White - 6a0b3');
    assert.equal(pickerProps?.runs?.[0]?.storage_origin, 'local');
    assert.equal(pickerProps?.runs?.[0]?.storage_state, 'live');
  } finally {
    harness.cleanup();
  }
});

test('runtime ops page scopes run-list query key and request path by category', async () => {
  const harness = await createRuntimeOpsRunListHarness({
    prefix: 'runtime-ops-page-query-scope-',
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

test('runtime ops page scopes selected worker persistence by run id', async () => {
  globalThis.window = { location: { protocol: 'http:', host: 'example.test' } };
  globalThis.__runtimeOpsSelectionHarness = {
    runId: 'run-123',
    calls: [],
  };

  const { RuntimeOpsPage } = await loadRuntimeOpsPageModule();
  const firstKey = captureSelectedWorkerPersistenceKey(RuntimeOpsPage, 'run-123');
  const secondKey = captureSelectedWorkerPersistenceKey(RuntimeOpsPage, 'run-456');

  assert.equal(firstKey, 'runtimeOps:workers:selectedWorker:mouse:run-123');
  assert.equal(secondKey, 'runtimeOps:workers:selectedWorker:mouse:run-456');
  assert.equal(firstKey === 'runtimeOps:workers:selectedWorker:mouse', false);
  assert.equal(secondKey === 'runtimeOps:workers:selectedWorker:mouse', false);

  delete globalThis.__runtimeOpsSelectionHarness;
  delete globalThis.window;
});
