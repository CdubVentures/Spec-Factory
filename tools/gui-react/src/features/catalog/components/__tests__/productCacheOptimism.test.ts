import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  patchCachedProduct,
  removeCachedProduct,
  patchSharedProductCaches,
  removeSharedProductCaches,
  restoreSharedProductCaches,
} from '../productCacheOptimism.ts';
import type { CatalogProduct, CatalogRow } from '../../../../types/product.ts';
import type { ProductsIndexResponse } from '../../../../types/review.ts';

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    productId: 'p1',
    id: 1,
    identifier: 'id-1',
    brand: 'Acme',
    model: 'Mouse One',
    base_model: 'Mouse One',
    variant: 'Black',
    status: 'active',
    added_at: '2026-01-01T00:00:00.000Z',
    added_by: 'test',
    ...overrides,
  };
}

function catalogRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: 'p1',
    id: 1,
    identifier: 'id-1',
    brand: 'Acme',
    model: 'Mouse One',
    base_model: 'Mouse One',
    variant: 'Black',
    status: 'active',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
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

function reviewIndex(overrides: Partial<ProductsIndexResponse> = {}): ProductsIndexResponse {
  return {
    products: [
      {
        product_id: 'p1',
        category: 'mouse',
        identity: {
          id: 1,
          identifier: 'id-1',
          brand: 'Acme',
          model: 'Mouse One',
          variant: 'Black',
        },
        fields: {},
        metrics: {
          confidence: 0,
          coverage: 0,
          missing: 0,
          has_run: false,
          updated_at: '',
        },
      },
      {
        product_id: 'p2',
        category: 'mouse',
        identity: {
          id: 2,
          identifier: 'id-2',
          brand: 'Other',
          model: 'Mouse Two',
          variant: '',
        },
        fields: {},
        metrics: {
          confidence: 0,
          coverage: 0,
          missing: 0,
          has_run: false,
          updated_at: '',
        },
      },
    ],
    brands: ['Acme', 'Other'],
    total: 2,
    ...overrides,
  };
}

function createQueryClientHarness(entries: Array<[readonly unknown[], unknown]>) {
  const data = new Map(entries.map(([key, value]) => [JSON.stringify(key), value]));
  const calls: Array<readonly [string, unknown]> = [];
  return {
    queryClient: {
      getQueryData(queryKey: readonly unknown[]) {
        calls.push(['getQueryData', queryKey]);
        return data.get(JSON.stringify(queryKey));
      },
      setQueryData(queryKey: readonly unknown[], valueOrUpdater: unknown) {
        calls.push(['setQueryData', queryKey]);
        const key = JSON.stringify(queryKey);
        const current = data.get(key);
        const next = typeof valueOrUpdater === 'function'
          ? (valueOrUpdater as (value: unknown) => unknown)(current)
          : valueOrUpdater;
        data.set(key, next);
      },
      removeQueries(args: { queryKey: readonly unknown[] }) {
        calls.push(['removeQueries', args.queryKey]);
        data.delete(JSON.stringify(args.queryKey));
      },
    },
    get(queryKey: readonly unknown[]) {
      return data.get(JSON.stringify(queryKey));
    },
    calls,
  };
}

describe('product cache optimism', () => {
  it('removes a deleted product from the cached list immediately', () => {
    const rows = [product({ productId: 'p1' }), product({ productId: 'p2', id: 2 })];

    assert.deepEqual(removeCachedProduct(rows, 'p1'), [product({ productId: 'p2', id: 2 })]);
  });

  it('patches only editable product fields for an updated row', () => {
    const rows = [product()];

    assert.deepEqual(
      patchCachedProduct(rows, 'p1', {
        brand: 'New Brand',
        base_model: 'Mouse Two',
        variant: '',
        status: 'inactive',
        ignored: 'value',
      }),
      [
        product({
          brand: 'New Brand',
          model: 'Mouse Two',
          base_model: 'Mouse Two',
          variant: '',
          status: 'inactive',
        }),
      ],
    );
  });

  it('patches every product-derived query cache for an updated product', () => {
    const harness = createQueryClientHarness([
      [['catalog-products', 'mouse'], [product({ productId: 'p1' })]],
      [['catalog', 'mouse'], [catalogRow({ productId: 'p1' })]],
      [['catalog', 'mouse', 'indexing'], [catalogRow({ productId: 'p1' })]],
      [['catalog-review', 'mouse'], [product({ productId: 'p1' })]],
      [['reviewProductsIndex', 'mouse'], reviewIndex()],
    ]);

    const snapshot = patchSharedProductCaches(
      harness.queryClient as never,
      'mouse',
      'p1',
      {
        brand: 'New Brand',
        base_model: 'Mouse Two',
        variant: 'White',
        status: 'inactive',
      },
    );

    assert.equal((harness.get(['catalog-products', 'mouse']) as CatalogProduct[])[0].brand, 'New Brand');
    assert.equal((harness.get(['catalog', 'mouse']) as CatalogRow[])[0].model, 'Mouse Two');
    assert.equal((harness.get(['catalog', 'mouse', 'indexing']) as CatalogRow[])[0].status, 'inactive');
    assert.equal((harness.get(['catalog-review', 'mouse']) as CatalogProduct[])[0].variant, 'White');

    const review = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
    assert.equal(review.products[0].identity.brand, 'New Brand');
    assert.equal(review.products[0].identity.model, 'Mouse Two');
    assert.equal(review.products[0].identity.variant, 'White');
    assert.deepEqual(review.brands, ['New Brand', 'Other']);

    restoreSharedProductCaches(harness.queryClient as never, 'mouse', snapshot);
    assert.equal((harness.get(['catalog-products', 'mouse']) as CatalogProduct[])[0].brand, 'Acme');
    assert.equal((harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse).products[0].identity.brand, 'Acme');
  });

  it('removes deleted products from every product-derived query cache', () => {
    const harness = createQueryClientHarness([
      [['catalog-products', 'mouse'], [product({ productId: 'p1' }), product({ productId: 'p2', id: 2 })]],
      [['catalog', 'mouse'], [catalogRow({ productId: 'p1' }), catalogRow({ productId: 'p2', id: 2 })]],
      [['catalog', 'mouse', 'indexing'], [catalogRow({ productId: 'p1' }), catalogRow({ productId: 'p2', id: 2 })]],
      [['catalog-review', 'mouse'], [product({ productId: 'p1' }), product({ productId: 'p2', id: 2 })]],
      [['reviewProductsIndex', 'mouse'], reviewIndex()],
    ]);

    removeSharedProductCaches(harness.queryClient as never, 'mouse', 'p1');

    assert.deepEqual(
      (harness.get(['catalog-products', 'mouse']) as CatalogProduct[]).map((row) => row.productId),
      ['p2'],
    );
    assert.deepEqual(
      (harness.get(['catalog', 'mouse']) as CatalogRow[]).map((row) => row.productId),
      ['p2'],
    );
    assert.deepEqual(
      (harness.get(['catalog', 'mouse', 'indexing']) as CatalogRow[]).map((row) => row.productId),
      ['p2'],
    );
    assert.deepEqual(
      (harness.get(['catalog-review', 'mouse']) as CatalogProduct[]).map((row) => row.productId),
      ['p2'],
    );

    const review = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
    assert.deepEqual(review.products.map((row) => row.product_id), ['p2']);
    assert.deepEqual(review.brands, ['Other']);
    assert.equal(review.total, 1);
  });
});
