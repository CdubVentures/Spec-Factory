import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) return element.map(renderElement);
  if (element == null || typeof element !== 'object') return element;
  if (typeof element.type === 'function') {
    return renderElement(element.type(element.props || {}));
  }
  const children = Object.prototype.hasOwnProperty.call(element.props || {}, 'children')
    ? renderElement(element.props.children)
    : element.props?.children;
  return {
    ...element,
    props: {
      ...(element.props || {}),
      children,
    },
  };
}

function findOne(element, predicate) {
  let found = null;
  function visit(node) {
    if (found) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node == null || typeof node !== 'object') return;
    if (predicate(node)) {
      found = node;
      return;
    }
    visit(node.props?.children);
  }
  visit(element);
  return found;
}

function componentStub(name) {
  return `
    export function ${name}(props) {
      return { type: '${name}', props: props || {} };
    }
  `;
}

const catalogRow = {
  id: 1,
  productId: 'mouse-1',
  brand: 'Logi',
  model: 'G Pro',
  base_model: 'G Pro',
  variant: 'Black',
  identifier: 'mouse-1',
  confidence: 0.9,
  coverage: 0.8,
  fieldsFilled: 8,
  fieldsTotal: 10,
  cefRunCount: 0,
  pifVariants: [],
  skuVariants: [],
  rdfVariants: [{
    variant_id: 'v1',
    variant_key: 'black',
    variant_label: 'Black',
    color_atoms: ['black'],
    value: '2026-04-17',
    confidence: 88,
  }],
  keyTierProgress: [],
};

test('Overview RDF cells route release dates through the user date formatter', async () => {
  const module = await loadBundledModule('tools/gui-react/src/pages/overview/OverviewPage.tsx', {
    prefix: 'overview-rdf-date-formatting-',
    stubs: {
      react: `
        const contextValues = new WeakMap();
        export function createContext(defaultValue) {
          const context = { defaultValue };
          context.Provider = function Provider(props) {
            contextValues.set(context, props.value);
            return props.children ?? null;
          };
          return context;
        }
        export const memo = (component) => component;
        export function useContext(context) {
          return contextValues.has(context) ? contextValues.get(context) : context.defaultValue;
        }
        export function useDeferredValue(value) { return value; }
        export function useMemo(factory) { return factory(); }
        export function useCallback(fn) { return fn; }
        export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
        export function useEffect() {}
        export function useRef(value = null) { return { current: value }; }
      `,
      'react/jsx-runtime': `
        export function jsx(type, props) { return { type, props: props || {} }; }
        export const jsxs = jsx;
        export const Fragment = Symbol.for('fragment');
      `,
      '@tanstack/react-query': `
        export function useQuery(options) {
          const root = Array.isArray(options.queryKey) ? options.queryKey[0] : '';
          if (root === 'catalog') return { data: [globalThis.__overviewDateFormatting.catalogRow], isLoading: false };
          if (root === 'colors') return { data: [], isLoading: false };
          return { data: undefined, isLoading: false };
        }
      `,
      '../../api/client.ts': `
        export const api = { parsedGet: async () => [], get: async () => [] };
      `,
      '../../stores/uiCategoryStore.ts': `
        export function useUiCategoryStore(selector) {
          return selector({ category: 'mouse' });
        }
      `,
      '../../shared/ui/data-display/MetricCard.tsx': componentStub('MetricCard'),
      '../../shared/ui/data-display/DataTable.tsx': componentStub('DataTable'),
      '../../shared/ui/data-display/MiniGauge.tsx': componentStub('MiniGauge'),
      '../../shared/ui/feedback/Spinner.tsx': componentStub('Spinner'),
      '../../utils/formatting.ts': `
        export function pct(value) { return String(value); }
      `,
      '../../utils/dateTime.ts': `
        export function useFormatDateYMD() {
          return (value) => value === '2026-04-17' ? '04-17-26' : String(value || '');
        }
      `,
      '../../features/catalog/api/catalogParsers.ts': `
        export function parseCatalogRows(value) { return value; }
      `,
      '../../features/operations/hooks/useFinderOperations.ts': `
        export function useRunningModulesByProductOrdered() { return new Map(); }
      `,
      './CefRunPopover.tsx': componentStub('CefRunPopover'),
      './PifVariantsCell.tsx': componentStub('PifVariantsCell'),
      './ScalarVariantsCell.tsx': componentStub('ScalarVariantsCell'),
      './KeyTierRings.tsx': componentStub('KeyTierRings'),
      './ScoreCardCell.tsx': componentStub('ScoreCardCell'),
      './OverviewFilterBar.tsx': componentStub('OverviewFilterBar'),
      './CommandConsole.tsx': componentStub('CommandConsole'),
      './ActiveAndSelectedRow.tsx': componentStub('ActiveAndSelectedRow'),
      './OverviewLastRunCell.tsx': `
        export function OverviewLastRunCell(props) { return { type: 'OverviewLastRunCell', props: props || {} }; }
        export function OverviewLastRunHeaderToggle(props) { return { type: 'OverviewLastRunHeaderToggle', props: props || {} }; }
      `,
      './LiveOpsCell.tsx': componentStub('LiveOpsCell'),
      './overviewSelectionStore.ts': `
        export function useOverviewSelectionStore(selector) {
          return selector({ byCategory: {}, addMany: () => {}, toggle: () => {} });
        }
        export function useIsSelected() { return false; }
      `,
    },
  });

  globalThis.__overviewDateFormatting = { catalogRow };
  const tree = renderElement(module.OverviewPage());
  const table = findOne(tree, (node) => node.type === 'DataTable');
  assert.ok(table, 'expected OverviewPage to render a DataTable');

  const rdfColumn = table.props.columns.find((column) => column.accessorKey === 'rdfVariants');
  assert.ok(rdfColumn, 'expected RDF column');

  const cell = renderElement(rdfColumn.cell({ row: { original: catalogRow } }));
  assert.equal(cell.type, 'ScalarVariantsCell');
  assert.equal(cell.props.formatLabel('2026-04-17'), '04-17-26');
  assert.equal(cell.props.formatValue('2026-04-17'), '04-17-26');
});
