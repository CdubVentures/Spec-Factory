import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function resetHarness() {
  const cache = new Map();
  globalThis.__pifDeleteImagesHarness = {
    cache,
    mutationOptions: null,
    apiCalls: [],
    set(queryKey, value) {
      cache.set(JSON.stringify(queryKey), value);
    },
    get(queryKey) {
      return cache.get(JSON.stringify(queryKey));
    },
  };
}

async function loadQueriesModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/product-image-finder/api/productImageFinderQueries.ts',
    {
      prefix: 'pif-delete-images-query-',
      stubs: {
        '@tanstack/react-query': `
          export function useQuery() { return {}; }
          export function useMutation(options) {
            globalThis.__pifDeleteImagesHarness.mutationOptions = options;
            return { mutate: () => {}, mutateAsync: async () => undefined, isPending: false };
          }
          export function useQueryClient() {
            return {
              getQueryData: (queryKey) => globalThis.__pifDeleteImagesHarness.get(queryKey),
              setQueryData: (queryKey, valueOrUpdater) => {
                const current = globalThis.__pifDeleteImagesHarness.get(queryKey);
                const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(current) : valueOrUpdater;
                globalThis.__pifDeleteImagesHarness.set(queryKey, next);
              },
              invalidateQueries: () => {},
              removeQueries: () => {},
            };
          }
        `,
        '../../../api/client.ts': `
          export const api = {
            get: async () => ({}),
            post: async () => ({}),
            patch: async () => ({}),
            del: async (path, body) => {
              globalThis.__pifDeleteImagesHarness.apiCalls.push({ path, body });
              return { ok: true, deleted: body?.filenames ?? [] };
            },
          };
        `,
      },
    },
  );
}

function image(filename, variantKey = 'color:black') {
  return { view: 'top', filename, variant_key: variantKey };
}

test('useDeleteProductImagesMutation calls bulk endpoint and patches mounted caches optimistically', async () => {
  resetHarness();
  const { useDeleteProductImagesMutation } = await loadQueriesModule();
  const detailKey = ['product-image-finder', 'mouse', 'p1'];
  const summaryKey = ['product-image-finder', 'mouse', 'p1', 'summary'];
  const catalogKey = ['catalog', 'mouse'];

  globalThis.__pifDeleteImagesHarness.set(detailKey, {
    product_id: 'p1',
    category: 'mouse',
    images: [image('a.png'), image('b.png')],
    image_count: 2,
    run_count: 1,
    last_ran_at: '',
    selected: { images: [image('a.png'), image('b.png')] },
    runs: [{
      selected: { images: [image('a.png'), image('b.png')] },
      response: { images: [image('a.png'), image('b.png')] },
    }],
  });
  globalThis.__pifDeleteImagesHarness.set(summaryKey, {
    product_id: 'p1',
    category: 'mouse',
    images: [image('a.png'), image('b.png')],
    image_count: 2,
    run_count: 1,
    last_ran_at: '',
    runs: [{
      run_number: 1,
      ran_at: '',
      model: 'm',
      fallback_used: false,
      selected: { images: [image('a.png'), image('b.png')] },
    }],
  });
  globalThis.__pifDeleteImagesHarness.set(catalogKey, [{
    productId: 'p1',
    pifVariants: [
      {
        variant_id: 'v-black',
        variant_key: 'color:black',
        variant_label: 'Black',
        color_atoms: ['black'],
        priority_filled: 1,
        priority_total: 3,
        loop_filled: 1,
        loop_total: 3,
        hero_filled: 1,
        hero_target: 3,
        image_count: 2,
      },
      {
        variant_id: 'v-white',
        variant_key: 'color:white',
        variant_label: 'White',
        color_atoms: ['white'],
        priority_filled: 1,
        priority_total: 3,
        loop_filled: 0,
        loop_total: 3,
        hero_filled: 0,
        hero_target: 3,
        image_count: 1,
      },
    ],
  }]);

  useDeleteProductImagesMutation('mouse', 'p1');
  const variables = { filenames: ['a.png'], scope: 'variant', variantKey: 'color:black' };
  globalThis.__pifDeleteImagesHarness.mutationOptions.onMutate(variables);
  await globalThis.__pifDeleteImagesHarness.mutationOptions.mutationFn(variables);

  assert.deepEqual(
    globalThis.__pifDeleteImagesHarness.apiCalls,
    [{ path: '/product-image-finder/mouse/p1/images', body: { filenames: ['a.png'] } }],
  );
  assert.deepEqual(
    globalThis.__pifDeleteImagesHarness.get(detailKey).images.map((entry) => entry.filename),
    ['b.png'],
  );
  assert.deepEqual(
    globalThis.__pifDeleteImagesHarness.get(summaryKey).images.map((entry) => entry.filename),
    ['b.png'],
  );
  const [row] = globalThis.__pifDeleteImagesHarness.get(catalogKey);
  assert.equal(row.pifVariants[0].image_count, 0);
  assert.equal(row.pifVariants[0].priority_filled, 0);
  assert.equal(row.pifVariants[1].image_count, 1);
});
