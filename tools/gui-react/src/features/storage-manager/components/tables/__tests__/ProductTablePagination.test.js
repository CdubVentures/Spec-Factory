import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) return element.map(renderElement);
  if (element == null || typeof element !== 'object') return element;
  if (typeof element.type === 'function') return renderElement(element.type(element.props || {}));
  return {
    ...element,
    props: {
      ...(element.props || {}),
      children: renderElement(element.props?.children),
    },
  };
}

function collectNodes(node, predicate, output = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, output);
    return output;
  }
  if (node == null || typeof node !== 'object') return output;
  if (predicate(node)) output.push(node);
  collectNodes(node.props?.children, predicate, output);
  return output;
}

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return textContent(node.props?.children);
}

async function loadProductTableModule() {
  return loadBundledModule('tools/gui-react/src/features/storage-manager/components/tables/ProductTable.tsx', {
    prefix: 'storage-product-table-pagination-',
    stubs: {
      react: `
        export const Fragment = Symbol.for('fragment');
        export function useMemo(factory) { return factory(); }
        export function useState(initialValue) {
          return [typeof initialValue === 'function' ? initialValue() : initialValue, () => {}];
        }
      `,
      'react/jsx-runtime': `
        export function jsx(type, props) { return { type, props: props || {} }; }
        export const jsxs = jsx;
        export const Fragment = Symbol.for('fragment');
      `,
      '@/shared/ui/feedback/Chip': `
        export function Chip(props) { return { type: 'span', props: { children: props.label, className: props.className } }; }
      `,
      '@/shared/ui/feedback/Spinner': `
        export function Spinner(props) { return { type: 'span', props: { className: props.className, children: 'spinner' } }; }
      `,
      '@/shared/ui/feedback/AlertBanner': `
        export function AlertBanner(props) { return { type: 'div', props: { children: props.message || props.title } }; }
      `,
      '../../state/useRunDetail.ts': `
        export function useRunDetail(runId, page) {
          globalThis.__storageProductTableHarness.runDetailCalls.push({ runId, page });
          return {
            data: {
              sources: [
                {
                  url: 'https://example.test/a',
                  status: 200,
                  success: true,
                  blocked: false,
                  block_reason: null,
                  worker_id: 'w1',
                  content_hash: 'abc123456789',
                  html_file: 'a.html.gz',
                  screenshot_count: 0,
                  video_file: null,
                  timeout_rescued: false,
                  fetch_error: null,
                  total_size: 100,
                },
                {
                  url: 'https://example.test/b',
                  status: 200,
                  success: true,
                  blocked: false,
                  block_reason: null,
                  worker_id: 'w1',
                  content_hash: 'def123456789',
                  html_file: 'b.html.gz',
                  screenshot_count: 0,
                  video_file: null,
                  timeout_rescued: false,
                  fetch_error: null,
                  total_size: 100,
                },
              ],
              sources_page: { limit: 2, offset: 0, total: 3, has_more: true },
            },
            isLoading: false,
            error: null,
          };
        }
      `,
      '../../../../stores/tabStore.ts': `
        export function usePersistedTab(_key, fallback) { return [fallback, () => {}]; }
        export function usePersistedExpandMap(key) {
          if (key === 'storage:products') return [{ 'Razer Viper': true }, () => {}];
          if (key === 'storage:runs') return [{ 'run-123': true }, () => {}];
          return [{}, () => {}];
        }
      `,
      '../StorageLoadingSkeleton.tsx': `
        export function StorageProductTableSkeleton() { return { type: 'div', props: { children: 'loading' } }; }
      `,
      '../../../../utils/dateTime.ts': `
        export function parseBackendMs(value) { return Date.parse(value || '2026-04-28T00:00:00.000Z'); }
      `,
    },
  });
}

function resetHarness() {
  globalThis.__storageProductTableHarness = {
    runDetailCalls: [],
  };
}

const run = {
  run_id: 'run-123',
  category: 'mouse',
  product_id: 'mouse-1',
  brand: 'Razer',
  model: 'Viper',
  variant: '',
  status: 'completed',
  started_at: '2026-04-28T00:00:00.000Z',
  ended_at: '2026-04-28T00:01:00.000Z',
  counters: {
    pages_checked: 0,
    fetched_ok: 0,
    fetched_404: 0,
    fetched_blocked: 0,
    fetched_error: 0,
    parse_completed: 0,
    indexed_docs: 0,
    fields_filled: 0,
    search_workers: 0,
  },
  size_bytes: 100,
};

test('expanded storage run detail reveals source pagination and load-more control', async () => {
  resetHarness();
  const { ProductTable } = await loadProductTableModule();

  const tree = renderElement(ProductTable({
    products: [{ key: 'Razer Viper', brand: 'Razer', model: 'Viper', runs: [run], totalSize: 100 }],
    isLoading: false,
    onDeleteAll: () => {},
    onDeleteRun: () => {},
    isDeleting: false,
  }));

  assert.deepEqual(globalThis.__storageProductTableHarness.runDetailCalls, [{
    runId: 'run-123',
    page: { sourcesLimit: 100, sourcesOffset: 0 },
  }]);

  const buttons = collectNodes(tree, (node) => node.type === 'button');
  assert.equal(
    buttons.some((button) => /Load 1 more source/.test(textContent(button))),
    true,
  );
});
