import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectCatalogRowPatchTargets,
  patchCatalogRowsFromDataChange,
  shouldSkipCatalogListInvalidation,
} from '../catalogRowPatch.ts';
import type { CatalogRow } from '../../../../types/product.ts';

function catalogRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: 'mouse-1',
    id: 1,
    identifier: 'id-1',
    brand: 'Acme',
    brand_identifier: '',
    model: 'Orbit',
    base_model: 'Orbit',
    variant: '',
    status: 'active',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifDependencyReady: true,
    pifDependencyRequiredKeys: [],
    pifDependencyResolvedKeys: [],
    pifDependencyMissingKeys: [],
    pifVariants: [],
    skuVariants: [],
    rdfVariants: [],
    keyTierProgress: [],
    cefLastRunAt: '',
    pifLastRunAt: '',
    rdfLastRunAt: '',
    skuLastRunAt: '',
    kfLastRunAt: '',
    ...overrides,
  };
}

function createQueryClientHarness(entries: Array<[readonly unknown[], unknown]>) {
  const data = new Map(entries.map(([key, value]) => [JSON.stringify(key), value]));
  const invalidated: unknown[][] = [];
  const setCalls: unknown[][] = [];
  return {
    queryClient: {
      getQueryData(queryKey: readonly unknown[]) {
        return data.get(JSON.stringify(queryKey));
      },
      setQueryData(queryKey: readonly unknown[], valueOrUpdater: unknown) {
        setCalls.push([...queryKey]);
        const key = JSON.stringify(queryKey);
        const current = data.get(key);
        const next = typeof valueOrUpdater === 'function'
          ? (valueOrUpdater as (value: unknown) => unknown)(current)
          : valueOrUpdater;
        data.set(key, next);
      },
      invalidateQueries({ queryKey }: { queryKey: readonly unknown[] }) {
        invalidated.push([...queryKey]);
      },
    },
    get(queryKey: readonly unknown[]) {
      return data.get(JSON.stringify(queryKey));
    },
    invalidated,
    setCalls,
  };
}

describe('collectCatalogRowPatchTargets', () => {
  it('returns category/product pairs only for catalog-affecting product-scoped messages', () => {
    const targets = collectCatalogRowPatchTargets({
      message: {
        event: 'product-image-images-delete',
        category: 'mouse',
        domains: ['product-image', 'catalog'],
        entities: { productIds: ['mouse-1', 'mouse-1', 'mouse-2'] },
      },
      fallbackCategory: 'keyboard',
    });

    assert.deepEqual(targets, [
      { category: 'mouse', productIds: ['mouse-1', 'mouse-2'] },
    ]);
  });

  it('returns no targets when the message has no product ids', () => {
    const targets = collectCatalogRowPatchTargets({
      message: { event: 'brand-update', category: 'mouse', domains: ['catalog'] },
      fallbackCategory: 'mouse',
    });

    assert.deepEqual(targets, []);
  });
});

describe('patchCatalogRowsFromDataChange', () => {
  it('replaces touched rows in Overview and Indexing catalog caches', async () => {
    const harness = createQueryClientHarness([
      [['catalog', 'mouse'], [
        catalogRow({ productId: 'mouse-1', fieldsFilled: 1 }),
        catalogRow({ productId: 'mouse-2', id: 2, fieldsFilled: 0 }),
      ]],
      [['catalog', 'mouse', 'indexing'], [
        catalogRow({ productId: 'mouse-1', fieldsFilled: 1 }),
      ]],
    ]);
    const requests: string[] = [];
    const api = {
      parsedGet: async (path: string) => {
        requests.push(path);
        return catalogRow({ productId: 'mouse-1', fieldsFilled: 5, coverage: 0.5 });
      },
    };

    const result = await patchCatalogRowsFromDataChange({
      api,
      queryClient: harness.queryClient,
      message: {
        event: 'product-image-images-delete',
        category: 'mouse',
        domains: ['product-image', 'catalog'],
        entities: { productIds: ['mouse-1'] },
      },
      fallbackCategory: 'mouse',
    });

    assert.deepEqual(requests, ['/catalog/mouse/rows/mouse-1']);
    assert.equal(result.patched, true);
    assert.equal((harness.get(['catalog', 'mouse']) as CatalogRow[])[0].fieldsFilled, 5);
    assert.equal((harness.get(['catalog', 'mouse', 'indexing']) as CatalogRow[])[0].coverage, 0.5);
    assert.deepEqual(harness.invalidated, []);
  });

  it('removes deleted products from shared catalog row caches without fetching', async () => {
    const harness = createQueryClientHarness([
      [['catalog', 'mouse'], [
        catalogRow({ productId: 'mouse-1' }),
        catalogRow({ productId: 'mouse-2', id: 2 }),
      ]],
      [['catalog', 'mouse', 'indexing'], [
        catalogRow({ productId: 'mouse-1' }),
        catalogRow({ productId: 'mouse-2', id: 2 }),
      ]],
    ]);
    const requests: string[] = [];
    const api = {
      parsedGet: async (path: string) => {
        requests.push(path);
        return catalogRow();
      },
    };

    const result = await patchCatalogRowsFromDataChange({
      api,
      queryClient: harness.queryClient,
      message: {
        event: 'catalog-product-delete',
        category: 'mouse',
        domains: ['catalog'],
        entities: { productIds: ['mouse-1'] },
      },
      fallbackCategory: 'mouse',
    });

    assert.deepEqual(requests, []);
    assert.equal(result.patched, true);
    assert.deepEqual(
      (harness.get(['catalog', 'mouse']) as CatalogRow[]).map((row) => row.productId),
      ['mouse-2'],
    );
    assert.deepEqual(
      (harness.get(['catalog', 'mouse', 'indexing']) as CatalogRow[]).map((row) => row.productId),
      ['mouse-2'],
    );
  });

  it('falls back to catalog invalidation when a row fetch fails', async () => {
    const harness = createQueryClientHarness([
      [['catalog', 'mouse'], [catalogRow({ productId: 'mouse-1', fieldsFilled: 1 })]],
    ]);
    const api = {
      parsedGet: async () => {
        throw new Error('API 500');
      },
    };

    const result = await patchCatalogRowsFromDataChange({
      api,
      queryClient: harness.queryClient,
      message: {
        event: 'key-finder-published',
        category: 'mouse',
        domains: ['catalog'],
        entities: { productIds: ['mouse-1'] },
      },
      fallbackCategory: 'mouse',
    });

    assert.equal(result.patched, false);
    assert.deepEqual(result.failedCategories, ['mouse']);
    assert.deepEqual(harness.invalidated, [
      ['catalog', 'mouse'],
      ['catalog', 'mouse', 'indexing'],
    ]);
  });
});

describe('shouldSkipCatalogListInvalidation', () => {
  it('skips broad catalog invalidation for patchable product-scoped catalog messages only', () => {
    const message = {
      event: 'product-image-images-delete',
      category: 'mouse',
      domains: ['product-image', 'catalog'],
      entities: { productIds: ['mouse-1'] },
    };

    assert.equal(shouldSkipCatalogListInvalidation({ queryKey: ['catalog', 'mouse'], message, fallbackCategory: 'mouse' }), true);
    assert.equal(shouldSkipCatalogListInvalidation({ queryKey: ['catalog', 'mouse', 'indexing'], message, fallbackCategory: 'mouse' }), true);
    assert.equal(shouldSkipCatalogListInvalidation({ queryKey: ['catalog-products', 'mouse'], message, fallbackCategory: 'mouse' }), false);
    assert.equal(shouldSkipCatalogListInvalidation({
      queryKey: ['catalog', 'mouse'],
      message: { event: 'brand-update', category: 'mouse', domains: ['catalog'] },
      fallbackCategory: 'mouse',
    }), false);
  });
});
