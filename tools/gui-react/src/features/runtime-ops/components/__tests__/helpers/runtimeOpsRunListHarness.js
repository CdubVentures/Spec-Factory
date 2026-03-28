import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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

export function flattenText(node) {
  if (Array.isArray(node)) {
    return node.map(flattenText).join(' ');
  }
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return flattenText(node.props?.children);
}

function defaultProcessStatusResult() {
  return {
    data: { running: false, run_id: null, startedAt: null },
    isLoading: false,
    isFetching: false,
  };
}

function defaultRunsQueryResult() {
  return {
    data: undefined,
    isLoading: true,
    isFetching: true,
  };
}

function defaultPickerRender(props) {
  return {
    type: 'div',
    props: {
      children: [props.isLoading ? 'Loading runs…' : 'ready'],
    },
  };
}

export async function createRuntimeOpsRunListHarness({
  prefix = 'runtime-ops-run-list-',
  category = 'mouse',
  pickerRunId = '',
  activeScope = false,
  processStatusResult = defaultProcessStatusResult(),
  runsQueryResult = defaultRunsQueryResult(),
  renderPicker = defaultPickerRender,
} = {}) {
  globalThis.window = { location: { protocol: 'http:', host: 'example.test' } };
  globalThis.__runtimeOpsRunQueryHarness = {
    activeScope,
    apiCalls: [],
    calls: [],
    category,
    pickerProps: [],
    pickerRunId,
    processStatusResult,
    renderPicker,
    runsQueryResult,
  };

  const { RuntimeOpsPage } = await loadBundledModule(
    'tools/gui-react/src/features/runtime-ops/components/RuntimeOpsPage.tsx',
    {
      prefix,
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
            const harness = globalThis.__runtimeOpsRunQueryHarness;
            harness.calls.push(options);
            const key = JSON.stringify(options?.queryKey || []);
            if (key === '["processStatus"]') {
              return harness.processStatusResult;
            }
            if (key.includes('"runs"')) {
              return harness.runsQueryResult;
            }
            return { data: undefined, isLoading: false, isFetching: false };
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
            async get(url) {
              globalThis.__runtimeOpsRunQueryHarness.apiCalls.push(url);
              return {};
            },
          };
        `,
        '../../../stores/uiStore': `
          export function useUiStore(selector) {
            return selector({ category: globalThis.__runtimeOpsRunQueryHarness.category });
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
              pickerRunId: globalThis.__runtimeOpsRunQueryHarness.pickerRunId,
              setPickerRunId() {},
            });
          }
        `,
        '../selectors/runActivityScopeHelpers.js': `
          export function resolveRunActiveScope() {
            return globalThis.__runtimeOpsRunQueryHarness.activeScope;
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
        './RuntimeOpsRunPicker': `
          export function RuntimeOpsRunPicker(props) {
            const harness = globalThis.__runtimeOpsRunQueryHarness;
            harness.pickerProps.push(props);
            return harness.renderPicker(props);
          }
        `,
      },
    },
  );

  return {
    renderPage() {
      return renderElement(RuntimeOpsPage());
    },
    getApiCalls() {
      return globalThis.__runtimeOpsRunQueryHarness.apiCalls;
    },
    getPickerProps() {
      return globalThis.__runtimeOpsRunQueryHarness.pickerProps.at(-1);
    },
    getRunQuery() {
      return globalThis.__runtimeOpsRunQueryHarness.calls.find((entry) => {
        const queryKey = JSON.stringify(entry?.queryKey || []);
        return queryKey.includes('"runs"') && !queryKey.includes('"processStatus"');
      });
    },
    cleanup() {
      delete globalThis.__runtimeOpsRunQueryHarness;
      delete globalThis.window;
    },
  };
}
