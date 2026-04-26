import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { CatalogRow } from '../../../types/product.ts';
import type { CatalogProduct } from '../../../types/product.ts';
import type { ProductReviewPayload, ProductsIndexResponse } from '../../../types/review.ts';

interface ProductIdentityFields {
  productId: string;
  brand: string;
  model: string;
  base_model: string;
  variant: string;
  status: string;
}

export interface SharedProductCacheSnapshot {
  readonly catalogProducts: CatalogProduct[] | undefined;
  readonly overviewCatalog: CatalogRow[] | undefined;
  readonly indexingCatalog: CatalogRow[] | undefined;
  readonly reviewCatalog: CatalogProduct[] | undefined;
  readonly reviewProductsIndex: ProductsIndexResponse | undefined;
}

function patchCachedProductRows<TProduct extends ProductIdentityFields>(
  products: readonly TProduct[] | undefined,
  productId: string,
  patch: Readonly<Record<string, unknown>>,
): TProduct[] {
  return (products ?? []).map((product) => {
    if (product.productId !== productId) return product;

    const baseModel = typeof patch.base_model === 'string'
      ? patch.base_model
      : product.base_model;

    return {
      ...product,
      ...(typeof patch.brand === 'string' ? { brand: patch.brand } : {}),
      ...(typeof patch.base_model === 'string' ? { base_model: baseModel, model: baseModel } : {}),
      ...(typeof patch.variant === 'string' ? { variant: patch.variant } : {}),
      ...(typeof patch.status === 'string' ? { status: patch.status } : {}),
    } as TProduct;
  });
}

function buildSharedProductCacheQueryKeys(category: string) {
  return {
    catalogProducts: ['catalog-products', category] as const,
    overviewCatalog: ['catalog', category] as const,
    indexingCatalog: ['catalog', category, 'indexing'] as const,
    reviewCatalog: ['catalog-review', category] as const,
    reviewProductsIndex: ['reviewProductsIndex', category] as const,
  };
}

function deriveReviewBrands(products: readonly ProductReviewPayload[]): string[] {
  return [...new Set(products.map((product) => product.identity.brand).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function patchReviewProductsIndex(
  data: ProductsIndexResponse | undefined,
  productId: string,
  patch: Readonly<Record<string, unknown>>,
): ProductsIndexResponse | undefined {
  if (!data) return data;
  const products = data.products.map((product) => {
    if (product.product_id !== productId) return product;
    const baseModel = typeof patch.base_model === 'string'
      ? patch.base_model
      : product.identity.model;
    return {
      ...product,
      identity: {
        ...product.identity,
        ...(typeof patch.brand === 'string' ? { brand: patch.brand } : {}),
        ...(typeof patch.base_model === 'string' ? { model: baseModel } : {}),
        ...(typeof patch.variant === 'string' ? { variant: patch.variant } : {}),
      },
    };
  });
  return {
    ...data,
    products,
    brands: deriveReviewBrands(products),
    total: products.length,
  };
}

function removeReviewProduct(
  data: ProductsIndexResponse | undefined,
  productId: string,
): ProductsIndexResponse | undefined {
  if (!data) return data;
  const products = data.products.filter((product) => product.product_id !== productId);
  return {
    ...data,
    products,
    brands: deriveReviewBrands(products),
    total: products.length,
  };
}

function patchLoadedArrayQuery<TProduct>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  patcher: (current: readonly TProduct[]) => TProduct[],
) {
  queryClient.setQueryData<TProduct[] | undefined>(queryKey, (current) => {
    if (!current) return current;
    return patcher(current);
  });
}

function restoreQueryData<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: TData | undefined,
) {
  if (data === undefined) {
    queryClient.removeQueries({ queryKey, exact: true });
    return;
  }
  queryClient.setQueryData<TData>(queryKey, data);
}

export function removeCachedProduct(
  products: readonly CatalogProduct[] | undefined,
  productId: string,
): CatalogProduct[] {
  return (products ?? []).filter((product) => product.productId !== productId);
}

export function patchCachedProduct(
  products: readonly CatalogProduct[] | undefined,
  productId: string,
  patch: Readonly<Record<string, unknown>>,
): CatalogProduct[] {
  return patchCachedProductRows(products, productId, patch);
}

export async function cancelSharedProductCacheQueries(
  queryClient: QueryClient,
  category: string,
): Promise<void> {
  const queryKeys = buildSharedProductCacheQueryKeys(category);
  await Promise.all(
    Object.values(queryKeys).map((queryKey) =>
      queryClient.cancelQueries({ queryKey, exact: true }),
    ),
  );
}

export function readSharedProductCacheSnapshot(
  queryClient: QueryClient,
  category: string,
): SharedProductCacheSnapshot {
  const queryKeys = buildSharedProductCacheQueryKeys(category);
  return {
    catalogProducts: queryClient.getQueryData<CatalogProduct[]>(queryKeys.catalogProducts),
    overviewCatalog: queryClient.getQueryData<CatalogRow[]>(queryKeys.overviewCatalog),
    indexingCatalog: queryClient.getQueryData<CatalogRow[]>(queryKeys.indexingCatalog),
    reviewCatalog: queryClient.getQueryData<CatalogProduct[]>(queryKeys.reviewCatalog),
    reviewProductsIndex: queryClient.getQueryData<ProductsIndexResponse>(queryKeys.reviewProductsIndex),
  };
}

export function restoreSharedProductCaches(
  queryClient: QueryClient,
  category: string,
  snapshot: SharedProductCacheSnapshot,
): void {
  const queryKeys = buildSharedProductCacheQueryKeys(category);
  restoreQueryData(queryClient, queryKeys.catalogProducts, snapshot.catalogProducts);
  restoreQueryData(queryClient, queryKeys.overviewCatalog, snapshot.overviewCatalog);
  restoreQueryData(queryClient, queryKeys.indexingCatalog, snapshot.indexingCatalog);
  restoreQueryData(queryClient, queryKeys.reviewCatalog, snapshot.reviewCatalog);
  restoreQueryData(queryClient, queryKeys.reviewProductsIndex, snapshot.reviewProductsIndex);
}

export function patchSharedProductCaches(
  queryClient: QueryClient,
  category: string,
  productId: string,
  patch: Readonly<Record<string, unknown>>,
): SharedProductCacheSnapshot {
  const queryKeys = buildSharedProductCacheQueryKeys(category);
  const snapshot = readSharedProductCacheSnapshot(queryClient, category);
  patchLoadedArrayQuery<CatalogProduct>(
    queryClient,
    queryKeys.catalogProducts,
    (current) => patchCachedProductRows(current, productId, patch),
  );
  patchLoadedArrayQuery<CatalogRow>(
    queryClient,
    queryKeys.overviewCatalog,
    (current) => patchCachedProductRows(current, productId, patch),
  );
  patchLoadedArrayQuery<CatalogRow>(
    queryClient,
    queryKeys.indexingCatalog,
    (current) => patchCachedProductRows(current, productId, patch),
  );
  patchLoadedArrayQuery<CatalogProduct>(
    queryClient,
    queryKeys.reviewCatalog,
    (current) => patchCachedProductRows(current, productId, patch),
  );
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    queryKeys.reviewProductsIndex,
    (current) => patchReviewProductsIndex(current, productId, patch),
  );
  return snapshot;
}

export function removeSharedProductCaches(
  queryClient: QueryClient,
  category: string,
  productId: string,
): SharedProductCacheSnapshot {
  const queryKeys = buildSharedProductCacheQueryKeys(category);
  const snapshot = readSharedProductCacheSnapshot(queryClient, category);
  patchLoadedArrayQuery<CatalogProduct>(
    queryClient,
    queryKeys.catalogProducts,
    (current) => removeCachedProduct(current, productId),
  );
  patchLoadedArrayQuery<CatalogRow>(
    queryClient,
    queryKeys.overviewCatalog,
    (current) => current.filter((product) => product.productId !== productId),
  );
  patchLoadedArrayQuery<CatalogRow>(
    queryClient,
    queryKeys.indexingCatalog,
    (current) => current.filter((product) => product.productId !== productId),
  );
  patchLoadedArrayQuery<CatalogProduct>(
    queryClient,
    queryKeys.reviewCatalog,
    (current) => removeCachedProduct(current, productId),
  );
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    queryKeys.reviewProductsIndex,
    (current) => removeReviewProduct(current, productId),
  );
  return snapshot;
}
