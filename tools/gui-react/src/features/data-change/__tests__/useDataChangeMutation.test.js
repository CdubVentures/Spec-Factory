import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function resetHarness() {
  globalThis.__dataChangeMutationHarness = {
    mutationOptions: null,
    invalidations: [],
    removals: [],
    order: [],
  };
}

async function loadHookModule() {
  return loadBundledModule('tools/gui-react/src/features/data-change/useDataChangeMutation.ts', {
    prefix: 'use-data-change-mutation-',
    stubs: {
      '@tanstack/react-query': `
        export function useMutation(options) {
          globalThis.__dataChangeMutationHarness.mutationOptions = options;
          return { mutate: () => {}, mutateAsync: async () => undefined, isPending: false };
        }
        export function useQueryClient() {
          return {
            invalidateQueries: (options) => {
              globalThis.__dataChangeMutationHarness.order.push('invalidate:' + JSON.stringify(options.queryKey));
              globalThis.__dataChangeMutationHarness.invalidations.push(options.queryKey);
            },
            removeQueries: (options) => {
              globalThis.__dataChangeMutationHarness.order.push('remove:' + JSON.stringify(options.queryKey));
              globalThis.__dataChangeMutationHarness.removals.push(options.queryKey);
            },
          };
        }
      `,
    },
  });
}

test('useDataChangeMutation invalidates registered event domains before caller onSuccess', async () => {
  resetHarness();
  const { useDataChangeMutation } = await loadHookModule();
  const userCalls = [];

  useDataChangeMutation({
    event: 'color-edition-finder-run-deleted',
    category: 'mouse',
    mutationFn: async () => ({ ok: true }),
    extraQueryKeys: [['publisher', 'published', 'mouse', 'mouse-1']],
    options: {
      onSuccess: () => {
        globalThis.__dataChangeMutationHarness.order.push('user-onSuccess');
        userCalls.push('called');
      },
    },
  });

  globalThis.__dataChangeMutationHarness.mutationOptions.onSuccess({ ok: true }, undefined, undefined);

  assert.deepEqual(userCalls, ['called']);
  assert.equal(
    globalThis.__dataChangeMutationHarness.invalidations.some((key) =>
      JSON.stringify(key) === JSON.stringify(['color-edition-finder', 'mouse'])),
    true,
  );
  assert.equal(
    globalThis.__dataChangeMutationHarness.invalidations.some((key) =>
      JSON.stringify(key) === JSON.stringify(['publisher', 'published', 'mouse', 'mouse-1'])),
    true,
  );
  assert.equal(
    globalThis.__dataChangeMutationHarness.order.at(-1),
    'user-onSuccess',
  );
});

test('useDataChangeMutation removes query keys before invalidating event coverage', async () => {
  resetHarness();
  const { useDataChangeMutation } = await loadHookModule();

  useDataChangeMutation({
    event: 'product-image-finder-run-deleted',
    category: 'mouse',
    mutationFn: async () => ({ ok: true }),
    removeQueryKeys: [['product-image-finder', 'mouse', 'mouse-1']],
  });

  globalThis.__dataChangeMutationHarness.mutationOptions.onSuccess({ ok: true }, 7, undefined);

  assert.deepEqual(globalThis.__dataChangeMutationHarness.removals, [
    ['product-image-finder', 'mouse', 'mouse-1'],
  ]);
  assert.equal(
    globalThis.__dataChangeMutationHarness.order[0],
    'remove:["product-image-finder","mouse","mouse-1"]',
  );
});

test('useDataChangeMutation can derive category and entities from mutation result', async () => {
  resetHarness();
  const { useDataChangeMutation } = await loadHookModule();

  useDataChangeMutation({
    event: 'storage-history-purged',
    mutationFn: async () => ({ ok: true }),
    resolveDataChangeMessage: ({ data }) => ({
      category: data.category,
      entities: { productIds: data.productIds },
    }),
  });

  globalThis.__dataChangeMutationHarness.mutationOptions.onSuccess(
    { ok: true, category: 'mouse', productIds: ['mouse-1'] },
    undefined,
    undefined,
  );

  assert.equal(
    globalThis.__dataChangeMutationHarness.invalidations.some((key) =>
      JSON.stringify(key) === JSON.stringify(['catalog', 'mouse'])),
    true,
  );
  assert.equal(
    globalThis.__dataChangeMutationHarness.invalidations.some((key) =>
      JSON.stringify(key) === JSON.stringify(['indexlab', 'product-history', 'mouse', 'mouse-1'])),
    true,
  );
});

test('useDataChangeMutation derives entity scope from mutation context', async () => {
  resetHarness();
  const { useDataChangeMutation } = await loadHookModule();

  useDataChangeMutation({
    event: 'candidate-deleted',
    category: 'mouse',
    mutationFn: async () => ({ ok: true }),
  });

  globalThis.__dataChangeMutationHarness.mutationOptions.onSuccess(
    { ok: true },
    { sourceId: 'manual-mouse-1' },
    { productId: 'mouse-1', field: 'weight' },
  );

  assert.equal(
    globalThis.__dataChangeMutationHarness.invalidations.some((key) =>
      JSON.stringify(key) === JSON.stringify(['candidates', 'mouse', 'mouse-1', 'weight'])),
    true,
  );
  assert.equal(
    globalThis.__dataChangeMutationHarness.invalidations.some((key) =>
      JSON.stringify(key) === JSON.stringify(['product', 'mouse', 'mouse-1'])),
    true,
  );
});

test('useDataChangeMutation rejects unknown event names at hook construction', async () => {
  resetHarness();
  const { useDataChangeMutation } = await loadHookModule();

  assert.throws(
    () => useDataChangeMutation({
      event: 'not-registered',
      category: 'mouse',
      mutationFn: async () => ({ ok: true }),
    }),
    /Unknown data-change event/,
  );
});
