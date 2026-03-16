import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadGuiModule(entryRelativePath, stubModules) {
  const esbuild = await import('esbuild');
  const entryPath = path.resolve(__dirname, '..', entryRelativePath);
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
    plugins: [
      {
        name: 'stub-modules',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (Object.prototype.hasOwnProperty.call(stubModules, args.path)) {
              return { path: args.path, namespace: 'stub' };
            }
            return null;
          });

          build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
            contents: stubModules[args.path],
            loader: 'js',
          }));
        },
      },
    ],
  });

  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-query-contract-'));
  const tmpFile = path.join(tmpDir, 'module.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    return await import(`file://${tmpFile.replace(/\\/g, '/')}?v=${Date.now()}-${Math.random()}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

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
    '../../api/client': `
      export const api = {
        get: async () => ({})
      };
    `,
    '../../stores/uiStore': `
      export function useUiStore(selector) {
        return selector(globalThis.__queryHarness.uiState);
      }
    `,
    '../../stores/productStore': `
      export function useProductStore(selector) {
        return selector({
          setSelectedProduct() {},
        });
      }
    `,
    '../../components/common/MetricRow': `
      export function MetricRow(props) {
        return { type: 'MetricRow', props };
      }
    `,
    '../../components/common/Spinner': `
      export function Spinner(props) {
        return { type: 'Spinner', props };
      }
    `,
    '../../components/common/ProgressBar': `
      export function ProgressBar(props) {
        return { type: 'ProgressBar', props };
      }
    `,
    '../../components/common/DataTable': `
      export function DataTable(props) {
        return { type: 'DataTable', props };
      }
    `,
    '../../components/common/StatusBadge': `
      export function StatusBadge(props) {
        return { type: 'StatusBadge', props };
      }
    `,
    '../../components/common/TrafficLight': `
      export function TrafficLight(props) {
        return { type: 'TrafficLight', props };
      }
    `,
    '../../utils/formatting': `
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

    const module = await loadGuiModule(row.entryRelativePath, buildCommonStubs());
    const Page = module[row.exportName];
    renderElement(Page());

    assert.deepEqual(globalThis.__queryHarness.calls, row.expectedCalls, row.label);
  }
});
