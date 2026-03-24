import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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
    prefix: 'runtime-ops-worker-selection-',
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
                  { run_id: 'run-123', category: 'mouse', product_id: 'mouse-razer-viper-v3-pro', started_at: '2026-03-11T00:00:00.000Z', ended_at: '2026-03-11T00:10:00.000Z', status: 'completed', storage_origin: 'local', picker_label: 'Mouse • Razer Viper V3 Pro - run-123' },
                  { run_id: 'run-456', category: 'mouse', product_id: 'mouse-logitech-g-pro-x-superlight-2', started_at: '2026-03-10T00:00:00.000Z', ended_at: '2026-03-10T00:10:00.000Z', status: 'completed', storage_origin: 'local', picker_label: 'Mouse • Logitech G Pro X Superlight 2 - run-456' },
                ],
              },
            };
          }
          if (String(key).includes('"workers"')) {
            return { data: { workers: [{ worker_id: 'fetch-3' }] } };
          }
          return { data: undefined };
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
        export function usePersistedTab(key, initialValue) {
          const calls = globalThis.__runtimeOpsSelectionHarness.calls;
          calls.push({ kind: 'tab', key });
          return ['workers', () => {}];
        }
        export function usePersistedNullableTab(key, initialValue) {
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
      '../panels/overview/FallbacksTab': `
        export function FallbacksTab() {
          return null;
        }
      `,
      '../panels/overview/QueueTab': `
        export function QueueTab() {
          return null;
        }
      `,
      '../panels/compound/CompoundTab': `
        export function CompoundTab() {
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

test('runtime ops worker selection persistence is scoped by run id to avoid stale fetch drawers across runs', async () => {
  globalThis.window = { location: { protocol: 'http:', host: 'example.test' } };
  globalThis.__runtimeOpsSelectionHarness = {
    runId: 'run-123',
    calls: [],
  };

  const { RuntimeOpsPage } = await loadRuntimeOpsPageModule();
  const firstKey = captureSelectedWorkerPersistenceKey(RuntimeOpsPage, 'run-123');
  const secondKey = captureSelectedWorkerPersistenceKey(RuntimeOpsPage, 'run-456');

  assert.equal(
    firstKey,
    'runtimeOps:workers:selectedWorker:mouse:run-123',
    'RuntimeOpsPage should scope selected worker persistence by run id for the first run',
  );
  assert.equal(
    secondKey,
    'runtimeOps:workers:selectedWorker:mouse:run-456',
    'RuntimeOpsPage should scope selected worker persistence by run id for the second run',
  );
  assert.equal(
    firstKey === 'runtimeOps:workers:selectedWorker:mouse' || secondKey === 'runtimeOps:workers:selectedWorker:mouse',
    false,
    'RuntimeOpsPage should not persist worker selection only by category',
  );

  delete globalThis.__runtimeOpsSelectionHarness;
  delete globalThis.window;
});
