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

function flattenText(node) {
  if (Array.isArray(node)) {
    return node.map(flattenText).join(' ');
  }
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return flattenText(node.props?.children);
}

async function loadRuntimeOpsPageModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx', {
    prefix: 'runtime-ops-run-query-',
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
      '../../../components/common/Spinner': `
        export function Spinner() {
          return { type: 'span', props: { children: 'spinner' } };
        }
      `,
      '@tanstack/react-query': `
        export function useQuery(options) {
          const calls = globalThis.__runtimeOpsRunQueryHarness.calls;
          calls.push(options);
          const key = JSON.stringify(options?.queryKey || []);
          if (key === '["processStatus"]') {
            return { data: { running: false, run_id: null, startedAt: null }, isLoading: false, isFetching: false };
          }
          if (key.includes('"runs"')) {
            return { data: undefined, isLoading: true, isFetching: true };
          }
          return { data: undefined, isLoading: false, isFetching: false };
        }
      `,
      '../../../api/client': `
        export const api = {
          async get(url) {
            const calls = globalThis.__runtimeOpsRunQueryHarness.apiCalls;
            calls.push(url);
            return {};
          },
        };
      `,
      '../../../stores/uiStore': `
        export function useUiStore(selector) {
          return selector({ category: 'mouse' });
        }
      `,
      '../../../stores/tabStore': `
        export function usePersistedTab() {
          return ['overview', () => {}];
        }
        export function usePersistedNullableTab() {
          return [null, () => {}];
        }
      `,
      '../../indexing/state/indexlabStore': `
        export function useIndexLabStore(selector) {
          return selector({
            pickerRunId: '',
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
        export function MetricsRail() { return null; }
      `,
      '../panels/overview/OverviewTab': `
        export function OverviewTab() { return null; }
      `,
      '../panels/workers/WorkersTab': `
        export function WorkersTab() { return null; }
      `,
      '../panels/overview/DocumentsTab': `
        export function DocumentsTab() { return null; }
      `,
      '../panels/overview/ExtractionTab': `
        export function ExtractionTab() { return null; }
      `,
      '../panels/overview/FallbacksTab': `
        export function FallbacksTab() { return null; }
      `,
      '../panels/overview/QueueTab': `
        export function QueueTab() { return null; }
      `,
      '../panels/compound/CompoundTab': `
        export function CompoundTab() { return null; }
      `,
      './RuntimeOpsRunPicker': `
        export function RuntimeOpsRunPicker(props) {
          globalThis.__runtimeOpsRunQueryHarness.pickerProps.push(props);
          return { type: 'div', props: { children: [props.isLoading ? 'Loading runs…' : 'ready'] } };
        }
      `,
    },
  });
}

test('runtime ops page scopes run-list query key and request by category', async () => {
  globalThis.window = { location: { protocol: 'http:', host: 'example.test' } };
  globalThis.__runtimeOpsRunQueryHarness = {
    calls: [],
    apiCalls: [],
    pickerProps: [],
  };

  const { RuntimeOpsPage } = await loadRuntimeOpsPageModule();
  renderElement(RuntimeOpsPage());

  const runQuery = globalThis.__runtimeOpsRunQueryHarness.calls.find((entry) => {
    const queryKey = JSON.stringify(entry?.queryKey || []);
    return queryKey.includes('"runs"') && !queryKey.includes('"processStatus"');
  });
  assert.deepEqual(
    runQuery?.queryKey,
    ['indexlab', 'runs', { category: 'mouse', limit: 40 }],
  );
  await runQuery.queryFn();
  assert.deepEqual(globalThis.__runtimeOpsRunQueryHarness.apiCalls, ['/indexlab/runs?limit=40&category=mouse']);

  delete globalThis.__runtimeOpsRunQueryHarness;
  delete globalThis.window;
});

test('runtime ops page builds active fallback label from live run identity and target storage', async () => {
  globalThis.window = { location: { protocol: 'http:', host: 'example.test' } };
  globalThis.__runtimeOpsRunQueryHarness = {
    calls: [],
    apiCalls: [],
    pickerProps: [],
  };

  const { RuntimeOpsPage } = await loadBundledModule('tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx', {
    prefix: 'runtime-ops-run-active-fallback-',
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
      '../../../components/common/Spinner': `
        export function Spinner() {
          return { type: 'span', props: { children: 'spinner' } };
        }
      `,
      '@tanstack/react-query': `
        export function useQuery(options) {
          const calls = globalThis.__runtimeOpsRunQueryHarness.calls;
          calls.push(options);
          const key = JSON.stringify(options?.queryKey || []);
          if (key === '["processStatus"]') {
            return {
              data: {
                running: true,
                relocating: false,
                run_id: '20260318061504-16a0b3',
                runId: '20260318061504-16a0b3',
                startedAt: '2026-03-18T06:15:04.000Z',
                category: 'mouse',
                product_id: 'mouse-razer-viper-v3-pro-white',
                productId: 'mouse-razer-viper-v3-pro-white',
                brand: 'Razer',
                model: 'Viper V3 Pro',
                variant: 'White',
                storage_destination: 's3',
                storageDestination: 's3',
              },
              isLoading: false,
              isFetching: false,
            };
          }
          if (key.includes('"runs"')) {
            return {
              data: { root: '', runs: [] },
              isLoading: false,
              isFetching: false,
            };
          }
          return { data: undefined, isLoading: false, isFetching: false };
        }
      `,
      '../../../api/client': `
        export const api = {
          async get(url) {
            const calls = globalThis.__runtimeOpsRunQueryHarness.apiCalls;
            calls.push(url);
            return {};
          },
        };
      `,
      '../../../stores/uiStore': `
        export function useUiStore(selector) {
          return selector({ category: 'mouse' });
        }
      `,
      '../../../stores/tabStore': `
        export function usePersistedTab() {
          return ['overview', () => {}];
        }
        export function usePersistedNullableTab() {
          return [null, () => {}];
        }
      `,
      '../../indexing/state/indexlabStore': `
        export function useIndexLabStore(selector) {
          return selector({
            pickerRunId: '',
            setPickerRunId() {},
          });
        }
      `,
      '../selectors/runActivityScopeHelpers.js': `
        export function resolveRunActiveScope() {
          return true;
        }
      `,
      '../panels/overview/MetricsRail': `
        export function MetricsRail() { return null; }
      `,
      '../panels/overview/OverviewTab': `
        export function OverviewTab() { return null; }
      `,
      '../panels/workers/WorkersTab': `
        export function WorkersTab() { return null; }
      `,
      '../panels/overview/DocumentsTab': `
        export function DocumentsTab() { return null; }
      `,
      '../panels/overview/ExtractionTab': `
        export function ExtractionTab() { return null; }
      `,
      '../panels/overview/FallbacksTab': `
        export function FallbacksTab() { return null; }
      `,
      '../panels/overview/QueueTab': `
        export function QueueTab() { return null; }
      `,
      '../panels/compound/CompoundTab': `
        export function CompoundTab() { return null; }
      `,
      './RuntimeOpsRunPicker': `
        export function RuntimeOpsRunPicker(props) {
          globalThis.__runtimeOpsRunQueryHarness.pickerProps.push(props);
          return { type: 'div', props: { children: ['ready'] } };
        }
      `,
    },
  });

  renderElement(RuntimeOpsPage());

  const pickerProps = globalThis.__runtimeOpsRunQueryHarness.pickerProps.at(-1);
  assert.equal(pickerProps?.runs?.[0]?.picker_label, 'Mouse • Razer Viper V3 Pro White - 6a0b3');
  assert.equal(pickerProps?.runs?.[0]?.storage_origin, 's3');
  assert.equal(pickerProps?.runs?.[0]?.storage_state, 'live');

  delete globalThis.__runtimeOpsRunQueryHarness;
  delete globalThis.window;
});

test('runtime ops page shows loading status above the picker when live fallback row is present', async () => {
  globalThis.window = { location: { protocol: 'http:', host: 'example.test' } };
  globalThis.__runtimeOpsRunQueryHarness = {
    calls: [],
    apiCalls: [],
    pickerProps: [],
  };

  const { RuntimeOpsPage } = await loadBundledModule('tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx', {
    prefix: 'runtime-ops-run-loading-status-',
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
      '../../../components/common/Spinner': `
        export function Spinner() {
          return { type: 'span', props: { children: 'spinner' } };
        }
      `,
      '@tanstack/react-query': `
        export function useQuery(options) {
          const calls = globalThis.__runtimeOpsRunQueryHarness.calls;
          calls.push(options);
          const key = JSON.stringify(options?.queryKey || []);
          if (key === '["processStatus"]') {
            return {
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
                storage_destination: 's3',
                storageDestination: 's3',
              },
              isLoading: false,
              isFetching: false,
            };
          }
          if (key.includes('"runs"')) {
            return {
              data: undefined,
              isLoading: true,
              isFetching: true,
            };
          }
          return { data: undefined, isLoading: false, isFetching: false };
        }
      `,
      '../../../api/client': `
        export const api = {
          async get(url) {
            const calls = globalThis.__runtimeOpsRunQueryHarness.apiCalls;
            calls.push(url);
            return {};
          },
        };
      `,
      '../../../stores/uiStore': `
        export function useUiStore(selector) {
          return selector({ category: 'mouse' });
        }
      `,
      '../../../stores/tabStore': `
        export function usePersistedTab() {
          return ['overview', () => {}];
        }
        export function usePersistedNullableTab() {
          return [null, () => {}];
        }
      `,
      '../../indexing/state/indexlabStore': `
        export function useIndexLabStore(selector) {
          return selector({
            pickerRunId: '',
            setPickerRunId() {},
          });
        }
      `,
      '../selectors/runActivityScopeHelpers.js': `
        export function resolveRunActiveScope() {
          return true;
        }
      `,
      '../panels/overview/MetricsRail': `
        export function MetricsRail() { return null; }
      `,
      '../panels/overview/OverviewTab': `
        export function OverviewTab() { return null; }
      `,
      '../panels/workers/WorkersTab': `
        export function WorkersTab() { return null; }
      `,
      '../panels/overview/DocumentsTab': `
        export function DocumentsTab() { return null; }
      `,
      '../panels/overview/ExtractionTab': `
        export function ExtractionTab() { return null; }
      `,
      '../panels/overview/FallbacksTab': `
        export function FallbacksTab() { return null; }
      `,
      '../panels/overview/QueueTab': `
        export function QueueTab() { return null; }
      `,
      '../panels/compound/CompoundTab': `
        export function CompoundTab() { return null; }
      `,
      './RuntimeOpsRunPicker': `
        export function RuntimeOpsRunPicker(props) {
          globalThis.__runtimeOpsRunQueryHarness.pickerProps.push(props);
          return { type: 'div', props: { children: [props.runs?.[0]?.picker_label || 'picker'] } };
        }
      `,
    },
  });

  const tree = renderElement(RuntimeOpsPage());
  const text = flattenText(tree);
  assert.match(text, /Loading run history/i);
  assert.match(text, /Mouse .*Razer Viper V3 Pro White - 6a0b3/);

  delete globalThis.__runtimeOpsRunQueryHarness;
  delete globalThis.window;
});

test('runtime ops page loading fallback row does not duplicate the category when identity is missing', async () => {
  globalThis.window = { location: { protocol: 'http:', host: 'example.test' } };
  globalThis.__runtimeOpsRunQueryHarness = {
    calls: [],
    apiCalls: [],
    pickerProps: [],
  };

  const { RuntimeOpsPage } = await loadBundledModule('tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx', {
    prefix: 'runtime-ops-run-loading-fallback-label-',
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
      '../../../components/common/Spinner': `
        export function Spinner() {
          return { type: 'span', props: { children: 'spinner' } };
        }
      `,
      '@tanstack/react-query': `
        export function useQuery(options) {
          const calls = globalThis.__runtimeOpsRunQueryHarness.calls;
          calls.push(options);
          const key = JSON.stringify(options?.queryKey || []);
          if (key === '["processStatus"]') {
            return {
              data: {
                running: true,
                run_id: '20260318-bff1e',
                runId: '20260318-bff1e',
                startedAt: '2026-03-18T06:15:04.000Z',
                category: 'mouse',
                product_id: '',
                productId: '',
                brand: '',
                model: '',
                variant: '',
                storage_destination: 's3',
                storageDestination: 's3',
              },
              isLoading: false,
              isFetching: false,
            };
          }
          if (key.includes('"runs"')) {
            return {
              data: undefined,
              isLoading: true,
              isFetching: true,
            };
          }
          return { data: undefined, isLoading: false, isFetching: false };
        }
      `,
      '../../../api/client': `
        export const api = {
          async get(url) {
            const calls = globalThis.__runtimeOpsRunQueryHarness.apiCalls;
            calls.push(url);
            return {};
          },
        };
      `,
      '../../../stores/uiStore': `
        export function useUiStore(selector) {
          return selector({ category: 'mouse' });
        }
      `,
      '../../../stores/tabStore': `
        export function usePersistedTab() {
          return ['overview', () => {}];
        }
        export function usePersistedNullableTab() {
          return [null, () => {}];
        }
      `,
      '../../indexing/state/indexlabStore': `
        export function useIndexLabStore(selector) {
          return selector({
            pickerRunId: '',
            setPickerRunId() {},
          });
        }
      `,
      '../selectors/runActivityScopeHelpers.js': `
        export function resolveRunActiveScope() {
          return true;
        }
      `,
      '../panels/overview/MetricsRail': `
        export function MetricsRail() { return null; }
      `,
      '../panels/overview/OverviewTab': `
        export function OverviewTab() { return null; }
      `,
      '../panels/workers/WorkersTab': `
        export function WorkersTab() { return null; }
      `,
      '../panels/overview/DocumentsTab': `
        export function DocumentsTab() { return null; }
      `,
      '../panels/overview/ExtractionTab': `
        export function ExtractionTab() { return null; }
      `,
      '../panels/overview/FallbacksTab': `
        export function FallbacksTab() { return null; }
      `,
      '../panels/overview/QueueTab': `
        export function QueueTab() { return null; }
      `,
      '../panels/compound/CompoundTab': `
        export function CompoundTab() { return null; }
      `,
      './RuntimeOpsRunPicker': `
        export function RuntimeOpsRunPicker(props) {
          globalThis.__runtimeOpsRunQueryHarness.pickerProps.push(props);
          return { type: 'div', props: { children: [props.runs?.[0]?.picker_label || 'picker'] } };
        }
      `,
    },
  });

  renderElement(RuntimeOpsPage());

  const pickerProps = globalThis.__runtimeOpsRunQueryHarness.pickerProps.at(-1);
  assert.equal(pickerProps?.runs?.[0]?.picker_label, 'Mouse - bff1e');

  delete globalThis.__runtimeOpsRunQueryHarness;
  delete globalThis.window;
});
