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
  const componentStub = `
    export function __stub__(props) {
      return { type: '__stub__', props };
    }
  `;

  return {
    react: `
      export function useMemo(factory) {
        return factory();
      }
      export function useState(init) {
        return [typeof init === 'function' ? init() : init, () => {}];
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
          return { totals: {}, by_day: {}, by_model: {}, days: [], by_day_reason: [], models: [], reasons: [], categories: [], entries: [], total: 0 };
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
    '../../shared/ui/data-display/MetricRow.tsx': componentStub.replace(/__stub__/g, 'MetricRow'),
    '../../shared/ui/data-display/MetricCard.tsx': componentStub.replace(/__stub__/g, 'MetricCard'),
    '../../shared/ui/data-display/DataTable.tsx': componentStub.replace(/__stub__/g, 'DataTable'),
    '../../shared/ui/feedback/Spinner.tsx': componentStub.replace(/__stub__/g, 'Spinner'),
    '../../utils/formatting.ts': `
      export function usd(value) { return String(value ?? ''); }
      export function compactNumber(value) { return String(value ?? ''); }
      export function pct(value) { return String(value ?? ''); }
      export function relativeTime(value) { return String(value ?? ''); }
    `,
    recharts: `
      export const BarChart = 'BarChart';
      export const Bar = 'Bar';
      export const XAxis = 'XAxis';
      export const YAxis = 'YAxis';
      export const Tooltip = 'Tooltip';
      export const ResponsiveContainer = 'ResponsiveContainer';
      export const CartesianGrid = 'CartesianGrid';
      export const Legend = 'Legend';
      export const PieChart = 'PieChart';
      export const Pie = 'Pie';
      export const Cell = 'Cell';
    `,
    '@tanstack/react-table': `
      export function useReactTable() { return { getRowModel: () => ({ rows: [] }), getHeaderGroups: () => [] }; }
      export function getCoreRowModel() { return () => {}; }
      export function getSortedRowModel() { return () => {}; }
      export function getFilteredRowModel() { return () => {}; }
      export function getExpandedRowModel() { return () => {}; }
      export function flexRender(comp, props) { return null; }
    `,
    // Feature module stubs — BillingPage imports these
    '../../features/billing/billingQueries.ts': `
      import { useQuery } from '@tanstack/react-query';

      const BILLING_REFETCH = 30_000;

      export function useBillingSummaryQuery() {
        return useQuery({ queryKey: ['billing', 'summary'], queryFn: async () => ({}), refetchInterval: BILLING_REFETCH });
      }
      export function useBillingPriorSummaryQuery() {
        return useQuery({ queryKey: ['billing', 'summary', 'prior'], queryFn: async () => ({}), refetchInterval: BILLING_REFETCH });
      }
      export function useBillingDailyQuery() {
        return useQuery({ queryKey: ['billing', 'daily'], queryFn: async () => ({}), refetchInterval: BILLING_REFETCH });
      }
      export function useBillingByModelQuery() {
        return useQuery({ queryKey: ['billing', 'by-model'], queryFn: async () => ({}), refetchInterval: BILLING_REFETCH });
      }
      export function useBillingByReasonQuery() {
        return useQuery({ queryKey: ['billing', 'by-reason'], queryFn: async () => ({}), refetchInterval: BILLING_REFETCH });
      }
      export function useBillingByCategoryQuery() {
        return useQuery({ queryKey: ['billing', 'by-category'], queryFn: async () => ({}), refetchInterval: BILLING_REFETCH });
      }
      export function useBillingEntriesQuery() {
        return useQuery({ queryKey: ['billing', 'entries', {}], queryFn: async () => ({}), refetchInterval: BILLING_REFETCH });
      }
    `,
    '../../features/billing/billingTypes.ts': `
      export {};
    `,
    '../../features/billing/billingTransforms.ts': `
      export function pivotDailyByReason() { return []; }
      export function computeAvgPerCall(c, n) { return n ? c / n : 0; }
      export function computeDonutSlices() { return []; }
      export function computeHorizontalBars() { return []; }
      export function chartColor(v) { return v; }
      export function computePeriodDeltas() { return { cost_usd: { pct: 0, direction: 'flat' }, calls: { pct: 0, direction: 'flat' }, prompt_tokens: { pct: 0, direction: 'flat' }, completion_tokens: { pct: 0, direction: 'flat' } }; }
      export function computeFilterChipCounts() { return { model: {}, reason: {}, category: {} }; }
      export function computeTokenSegments() { return { promptPct: 0, completionPct: 0, cachedPct: 0 }; }
    `,
    '../../features/billing/billingCallTypeRegistry.generated.ts': `
      export const BILLING_CALL_TYPE_REGISTRY = Object.freeze([]);
      export const BILLING_CALL_TYPE_MAP = Object.freeze({});
      export const BILLING_CALL_TYPE_FALLBACK = Object.freeze({ reason: 'unknown', label: 'Other', color: '#888' });
      export function resolveBillingCallType() { return { reason: 'unknown', label: 'Other', color: '#888' }; }
    `,
    '../../features/billing/components/BillingHeroBand.tsx': componentStub.replace(/__stub__/g, 'BillingHeroBand'),
    '../../features/billing/components/BillingFilterBar.tsx': componentStub.replace(/__stub__/g, 'BillingFilterBar'),
    '../../features/billing/components/DailyCostChart.tsx': componentStub.replace(/__stub__/g, 'DailyCostChart'),
    '../../features/billing/components/DailyTokenChart.tsx': componentStub.replace(/__stub__/g, 'DailyTokenChart'),
    '../../features/billing/components/BillingMetricDonut.tsx': componentStub.replace(/__stub__/g, 'BillingMetricDonut'),
    '../../features/billing/components/PromptCachePanel.tsx': componentStub.replace(/__stub__/g, 'PromptCachePanel'),
    '../../features/billing/components/HorizontalBarSection.tsx': componentStub.replace(/__stub__/g, 'HorizontalBarSection'),
    '../../features/billing/components/BillingEntryTable.tsx': componentStub.replace(/__stub__/g, 'BillingEntryTable'),
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

test('BillingPage calls 6 global billing query hooks with 30s refresh', async () => {
  globalThis.__queryHarness = {
    calls: [],
    uiState: { category: 'mouse', categories: ['mouse', 'keyboard'] },
  };

  const module = await loadGuiModule('tools/gui-react/src/pages/billing/BillingPage.tsx');
  const Page = module.BillingPage;
  renderElement(Page());

  // 5 direct queries from BillingPage (entries query lives inside BillingEntryTable child)
  const billingCalls = globalThis.__queryHarness.calls.filter(
    (c) => c.kind === 'query' && Array.isArray(c.queryKey) && c.queryKey[0] === 'billing',
  );

  assert.ok(billingCalls.length >= 5, `expected at least 5 billing queries, got ${billingCalls.length}`);

  const expectedKeys = ['summary', 'daily', 'by-model', 'by-reason', 'by-category'];
  for (const key of expectedKeys) {
    const found = billingCalls.find(
      (c) => Array.isArray(c.queryKey) && c.queryKey[1] === key,
    );
    assert.ok(found, `missing billing query with key ['billing', '${key}']`);
    assert.strictEqual(found.refetchInterval, 30_000, `billing/${key} should have 30s refresh`);
  }
});

test('OverviewPage billing query uses 30s cadence (not 10s catalog cadence)', async () => {
  globalThis.__queryHarness = {
    calls: [],
    uiState: { category: 'mouse' },
  };

  const module = await loadGuiModule('tools/gui-react/src/pages/overview/OverviewPage.tsx');
  const Page = module.OverviewPage;
  renderElement(Page());

  const billingCalls = globalThis.__queryHarness.calls.filter(
    (c) => c.kind === 'query' && Array.isArray(c.queryKey) && c.queryKey[0] === 'billing',
  );
  const catalogCalls = globalThis.__queryHarness.calls.filter(
    (c) => c.kind === 'query' && Array.isArray(c.queryKey) && c.queryKey[0] === 'catalog',
  );

  for (const c of billingCalls) {
    assert.strictEqual(c.refetchInterval, 30_000, 'billing should use 30s cadence');
  }
  for (const c of catalogCalls) {
    assert.strictEqual(c.refetchInterval, 10_000, 'catalog should use 10s cadence');
  }
});
