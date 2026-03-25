import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) {
    return element.map(renderElement);
  }
  if (element == null || typeof element !== 'object') {
    return element;
  }
  if (typeof element.type === 'function') {
    return renderElement(element.type(element.props || {}));
  }
  const nextChildren = element.props && Object.prototype.hasOwnProperty.call(element.props, 'children')
    ? renderElement(element.props.children)
    : element.props?.children;
  return {
    ...element,
    props: {
      ...(element.props || {}),
      children: nextChildren,
    },
  };
}

function buildCommonStubs() {
  return {
    react: `
      export function useMemo(factory) {
        return factory();
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
      function buildQueryResult(queryKey) {
        const root = String((queryKey || [])[0] || '');
        if (root === 'billing') {
          return { totals: {}, by_day: {}, by_model: {} };
        }
        if (root === 'learning') {
          return [];
        }
        if (root === 'catalog') {
          return [];
        }
        return undefined;
      }

      export function useQuery(options) {
        globalThis.__queryHarness.calls.push({
          kind: 'query',
          queryKey: options.queryKey,
          refetchInterval: options.refetchInterval,
        });
        return {
          data: buildQueryResult(options.queryKey),
          isLoading: false,
          isError: false,
        };
      }

      export function useQueries({ queries }) {
        globalThis.__queryHarness.calls.push({
          kind: 'queries',
          queries: queries.map((options) => ({
            queryKey: options.queryKey,
            refetchInterval: options.refetchInterval,
          })),
        });
        return queries.map((options) => ({
          data: buildQueryResult(options.queryKey),
          isLoading: false,
          isError: false,
        }));
      }
    `,
    '../../api/client.ts': `
      export const api = {
        get: async () => ({})
      };
    `,
    '../../stores/uiStore.ts': `
      export function useUiStore(selector) {
        return selector(globalThis.__queryHarness.uiState);
      }
    `,
    '../../stores/productStore.ts': `
      export function useProductStore(selector) {
        return selector({
          setSelectedProduct() {},
        });
      }
    `,
    '../../components/common/MetricRow.tsx': `
      export function MetricRow(props) {
        return { type: 'MetricRow', props };
      }
    `,
    '../../shared/ui/data-display/MetricRow.tsx': `
      export function MetricRow(props) {
        return { type: 'MetricRow', props };
      }
    `,
    '../../components/common/Spinner.tsx': `
      export function Spinner(props) {
        return { type: 'Spinner', props };
      }
    `,
    '../../shared/ui/feedback/Spinner.tsx': `
      export function Spinner(props) {
        return { type: 'Spinner', props };
      }
    `,
    '../../components/common/ProgressBar.tsx': `
      export function ProgressBar(props) {
        return { type: 'ProgressBar', props };
      }
    `,
    '../../shared/ui/data-display/ProgressBar.tsx': `
      export function ProgressBar(props) {
        return { type: 'ProgressBar', props };
      }
    `,
    '../../components/common/DataTable.tsx': `
      export function DataTable(props) {
        return { type: 'DataTable', props };
      }
    `,
    '../../shared/ui/data-display/DataTable.tsx': `
      export function DataTable(props) {
        return { type: 'DataTable', props };
      }
    `,
    '../../components/common/StatusBadge.tsx': `
      export function StatusBadge(props) {
        return { type: 'StatusBadge', props };
      }
    `,
    '../../shared/ui/feedback/StatusBadge.tsx': `
      export function StatusBadge(props) {
        return { type: 'StatusBadge', props };
      }
    `,
    '../../components/common/TrafficLight.tsx': `
      export function TrafficLight(props) {
        return { type: 'TrafficLight', props };
      }
    `,
    '../../shared/ui/feedback/TrafficLight.tsx': `
      export function TrafficLight(props) {
        return { type: 'TrafficLight', props };
      }
    `,
    '../../utils/formatting.ts': `
      export function usd(value) {
        return String(value ?? '');
      }
      export function compactNumber(value) {
        return String(value ?? '');
      }
      export function pct(value) {
        return String(value ?? '');
      }
      export function relativeTime(value) {
        return String(value ?? '');
      }
    `,
    recharts: `
      export const BarChart = 'BarChart';
      export const Bar = 'Bar';
      export const XAxis = 'XAxis';
      export const YAxis = 'YAxis';
      export const Tooltip = 'Tooltip';
      export const ResponsiveContainer = 'ResponsiveContainer';
      export const CartesianGrid = 'CartesianGrid';
    `,
  };
}

const COMMON_STUBS = buildCommonStubs();
const guiModulePromises = new Map();

function loadGuiModule(entryRelativePath) {
  if (!guiModulePromises.has(entryRelativePath)) {
    guiModulePromises.set(entryRelativePath, loadBundledModule(entryRelativePath, {
      prefix: 'billing-query-contract-',
      stubs: COMMON_STUBS,
    }));
  }
  return guiModulePromises.get(entryRelativePath);
}

test('billing and overview pages preserve their billing refresh contracts', async () => {
  const cases = [
    {
      label: 'BillingPage single-category mode',
      exportName: 'BillingPage',
      entryRelativePath: 'tools/gui-react/src/pages/billing/BillingPage.tsx',
      uiState: { category: 'mouse', categories: ['mouse', 'keyboard'] },
      expectedCalls: [
        { kind: 'query', queryKey: ['billing', 'mouse'], refetchInterval: 30_000 },
        { kind: 'query', queryKey: ['learning', 'mouse'], refetchInterval: 30_000 },
      ],
    },
    {
      label: 'BillingPage all-category mode',
      exportName: 'BillingPage',
      entryRelativePath: 'tools/gui-react/src/pages/billing/BillingPage.tsx',
      uiState: { category: 'all', categories: ['mouse', 'keyboard'] },
      expectedCalls: [
        {
          kind: 'queries',
          queries: [
            { queryKey: ['billing', 'mouse'], refetchInterval: 30_000 },
            { queryKey: ['billing', 'keyboard'], refetchInterval: 30_000 },
          ],
        },
      ],
    },
    {
      label: 'OverviewPage catalog vs billing cadence',
      exportName: 'OverviewPage',
      entryRelativePath: 'tools/gui-react/src/pages/overview/OverviewPage.tsx',
      uiState: { category: 'mouse' },
      expectedCalls: [
        { kind: 'query', queryKey: ['catalog', 'mouse'], refetchInterval: 10_000 },
        { kind: 'query', queryKey: ['billing', 'mouse'], refetchInterval: 30_000 },
      ],
    },
  ];

  for (const row of cases) {
    globalThis.__queryHarness = {
      calls: [],
      uiState: row.uiState,
    };

    const module = await loadGuiModule(row.entryRelativePath);
    const Page = module[row.exportName];
    renderElement(Page());

    assert.deepEqual(globalThis.__queryHarness.calls, row.expectedCalls, row.label);
  }
});
