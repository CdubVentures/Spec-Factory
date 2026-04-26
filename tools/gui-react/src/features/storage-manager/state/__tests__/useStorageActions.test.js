import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function resetHarness() {
  globalThis.__storageActionHarness = {
    mutations: [],
  };
}

async function loadStorageActions() {
  return loadBundledModule('tools/gui-react/src/features/storage-manager/state/useStorageActions.ts', {
    prefix: 'storage-actions-',
    stubs: {
      '../../../api/client.ts': `
        export const api = {
          del: async () => ({}),
          post: async () => ({}),
        };
      `,
      '../../data-change/index.js': `
        export function useDataChangeMutation(args) {
          globalThis.__storageActionHarness.mutations.push(args);
          return { mutate: () => {}, mutateAsync: async () => undefined, isPending: false };
        }
      `,
    },
  });
}

test('storage URL delete mutation resolves local data-change scope from variables', async () => {
  resetHarness();
  const { useDeleteUrl } = await loadStorageActions();

  useDeleteUrl();
  const mutation = globalThis.__storageActionHarness.mutations.at(-1);
  const message = mutation.resolveDataChangeMessage({
    data: { ok: true },
    variables: {
      category: 'mouse',
      productId: 'p1',
      url: 'https://example.test/a',
    },
  });

  assert.deepEqual(message, {
    category: 'mouse',
    entities: { productIds: ['p1'] },
  });
});

test('storage bulk delete mutation resolves local data-change scope from response', async () => {
  resetHarness();
  const { useBulkDeleteRuns } = await loadStorageActions();

  useBulkDeleteRuns();
  const mutation = globalThis.__storageActionHarness.mutations.at(-1);
  const message = mutation.resolveDataChangeMessage({
    data: {
      ok: true,
      deleted: [],
      errors: [],
      categories: ['mouse', 'keyboard'],
      product_ids: ['p1', 'p2'],
    },
    variables: ['run-1', 'run-2'],
  });

  assert.deepEqual(message, {
    categories: ['mouse', 'keyboard'],
    entities: { productIds: ['p1', 'p2'] },
  });
});
