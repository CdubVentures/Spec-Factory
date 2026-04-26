import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

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

const componentStub = `
  export function __component__(props) {
    return { type: '__component__', props: props || {} };
  }
`;

function commonStubs() {
  return {
    react: `
      export function useMemo(factory) { return factory(); }
      export function useCallback(fn) { return fn; }
      export function useState(initialValue) {
        return [typeof initialValue === 'function' ? initialValue() : initialValue, () => {}];
      }
    `,
    'react/jsx-runtime': `
      export function jsx(type, props) { return { type, props: props || {} }; }
      export const jsxs = jsx;
      export const Fragment = Symbol.for('fragment');
    `,
    '@tanstack/react-query': `
      function dataFor(queryKey) {
        const key = JSON.stringify(queryKey || []);
        if (key.startsWith('["publisher","published"')) return { fields: {} };
        if (key.startsWith('["publisher","reconcile"')) {
          return { threshold: 80, unpublished: 0, published: 0, locked: 0, unaffected: 0, total_fields: 0 };
        }
        if (key.startsWith('["publisher"')) {
          return { rows: [], stats: { total: 0, resolved: 0, pending: 0, repaired: 0, products: 0, unknown_stripped: 0 } };
        }
        return undefined;
      }
      export function useQuery(options) {
        globalThis.__publisherPollingHarness.calls.push({
          queryKey: options.queryKey,
          refetchInterval: options.refetchInterval,
        });
        return { data: dataFor(options.queryKey), isLoading: false, isError: false };
      }
      export function useMutation() {
        return { mutate: () => {}, isPending: false };
      }
      export function useQueryClient() {
        return { invalidateQueries: () => undefined };
      }
    `,
  };
}

async function loadGuiModule(entryRelativePath, stubs) {
  return loadBundledModule(entryRelativePath, {
    prefix: `publisher-polling-removal-${entryRelativePath.replace(/[^a-z0-9]/gi, '-')}-`,
    stubs,
  });
}

function resetHarness() {
  globalThis.__publisherPollingHarness = { calls: [], category: 'mouse' };
}

test('published-fields query relies on data-change invalidation instead of polling', async () => {
  resetHarness();
  const module = await loadGuiModule('tools/gui-react/src/hooks/usePublishedFields.ts', {
    ...commonStubs(),
    '../api/client.ts': `
      export const api = { get: async () => ({ fields: {} }) };
    `,
  });

  module.usePublishedFields('mouse', 'mouse-1');

  assert.deepEqual(globalThis.__publisherPollingHarness.calls, [{
    queryKey: ['publisher', 'published', 'mouse', 'mouse-1'],
    refetchInterval: undefined,
  }]);
});

test('publisher reconcile preview relies on data-change invalidation instead of polling', async () => {
  resetHarness();
  const module = await loadGuiModule('tools/gui-react/src/features/pipeline-settings/sections/PublisherReconcileSection.tsx', {
    ...commonStubs(),
    '../../../api/client.ts': `
      export const api = { get: async () => ({}), post: async () => ({ result: {} }) };
    `,
    '../../../stores/uiStore.ts': `
      export function useUiStore(selector) {
        return selector({ category: globalThis.__publisherPollingHarness.category });
      }
    `,
    '../../operations/state/operationsStore.ts': `
      export function useOperationsStore(selector) {
        return selector({ operations: new Map() });
      }
    `,
    '../../../shared/ui/feedback/Chip.tsx': componentStub.replace(/__component__/g, 'Chip'),
  });

  renderElement(module.default());

  assert.deepEqual(globalThis.__publisherPollingHarness.calls, [{
    queryKey: ['publisher', 'reconcile', 'mouse'],
    refetchInterval: undefined,
  }]);
});

test('publisher candidate list relies on data-change invalidation instead of polling', async () => {
  resetHarness();
  const module = await loadGuiModule('tools/gui-react/src/pages/publisher/PublisherPage.tsx', {
    ...commonStubs(),
    '../../stores/tabStore.ts': `
      export function usePersistedTab(_key, fallback) { return [fallback, () => {}]; }
      export function usePersistedNumber(_key, fallback) { return [fallback, () => {}]; }
    `,
    '../../api/client.ts': `
      export const api = { get: async () => ({ rows: [], stats: {} }) };
    `,
    '../../stores/uiStore.ts': `
      export function useUiStore(selector) {
        return selector({ category: globalThis.__publisherPollingHarness.category });
      }
    `,
    '../../shared/ui/data-display/DataTable.tsx': componentStub.replace(/__component__/g, 'DataTable'),
    '../../shared/ui/feedback/Chip.tsx': componentStub.replace(/__component__/g, 'Chip'),
    '../../shared/ui/feedback/Spinner.tsx': componentStub.replace(/__component__/g, 'Spinner'),
    '../../utils/dateTime.ts': `
      export function useFormatDateTime() { return (value) => String(value || ''); }
      export function useTimezoneLabel() { return 'UTC'; }
      export function parseBackendMs() { return Date.now(); }
    `,
    '../../utils/fieldNormalize.ts': `
      export function formatCellValue(value) { return String(value ?? ''); }
    `,
  });

  renderElement(module.PublisherPage());

  assert.deepEqual(globalThis.__publisherPollingHarness.calls, [{
    queryKey: ['publisher', 'mouse', 1, 100],
    refetchInterval: undefined,
  }]);
});
