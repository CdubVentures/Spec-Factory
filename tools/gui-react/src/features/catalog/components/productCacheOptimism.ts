import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { CatalogRow } from '../../../types/product.ts';
import type { CatalogProduct } from '../../../types/product.ts';
import type { ProductReviewPayload, ProductsIndexResponse } from '../../../types/review.ts';

interface ProductIdentityFields {
  productId: string;
  id: number;
  identifier: string;
  brand: string;
  brand_identifier?: string;
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

function compareProductIdentity(
  left: ProductIdentityFields,
  right: ProductIdentityFields,
): number {
  return left.brand.localeCompare(right.brand)
    || left.base_model.localeCompare(right.base_model)
    || left.variant.localeCompare(right.variant)
    || left.productId.localeCompare(right.productId);
}

function dedupeCreatedProducts<TProduct extends ProductIdentityFields>(
  products: readonly TProduct[],
): TProduct[] {
  const seen = new Set<string>();
  const output: TProduct[] = [];
  for (const product of products) {
    const productId = String(product.productId || '').trim();
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    output.push(product);
  }
  return output;
}

function insertProducts<TProduct extends ProductIdentityFields>(
  current: readonly TProduct[],
  createdProducts: readonly TProduct[],
): TProduct[] {
  const currentIds = new Set(current.map((product) => product.productId));
  return [
    ...current,
    ...createdProducts.filter((product) => !currentIds.has(product.productId)),
  ].sort(compareProductIdentity);
}

function buildCatalogRow(product: CatalogProduct): CatalogRow {
  return {
    productId: product.productId,
    id: product.id,
    identifier: product.identifier,
    brand: product.brand,
    ...(product.brand_identifier !== undefined ? { brand_identifier: product.brand_identifier } : {}),
    model: product.model,
    base_model: product.base_model,
    variant: product.variant,
    status: product.status,
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
  };
}

function buildReviewProduct(category: string, product: CatalogProduct): ProductReviewPayload {
  return {
    product_id: product.productId,
    category,
    identity: {
      id: product.id,
      identifier: product.identifier,
      brand: product.brand,
      model: product.model,
      variant: product.variant,
    },
    fields: {},
    metrics: {
      confidence: 0,
      coverage: 0,
      missing: 0,
      has_run: false,
      updated_at: '',
    },
    hasRun: false,
  };
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

function insertReviewProducts(
  data: ProductsIndexResponse | undefined,
  category: string,
  createdProducts: readonly CatalogProduct[],
): ProductsIndexResponse | undefined {
  if (!data) return data;
  const currentIds = new Set(data.products.map((product) => product.product_id));
  const insertedProducts = createdProducts
    .filter((product) => !currentIds.has(product.productId))
    .map((product) => buildReviewProduct(category, product));
  const products = [...data.products, ...insertedProducts].sort((left, right) =>
    compareProductIdentity({
      productId: left.product_id,
      id: left.identity.id,
      identifier: left.identity.identifier,
      brand: left.identity.brand,
      model: left.identity.model,
      base_model: left.identity.model,
      variant: left.identity.variant,
      status: 'active',
    }, {
      productId: right.product_id,
      id: right.identity.id,
      identifier: right.identity.identifier,
      brand: right.identity.brand,
      model: right.identity.model,
      base_model: right.identity.model,
      variant: right.identity.variant,
      status: 'active',
    }),
  );
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

export function insertSharedProductCaches(
  queryClient: QueryClient,
  category: string,
  products: readonly CatalogProduct[],
): SharedProductCacheSnapshot {
  const queryKeys = buildSharedProductCacheQueryKeys(category);
  const snapshot = readSharedProductCacheSnapshot(queryClient, category);
  const createdProducts = dedupeCreatedProducts(products);
  if (createdProducts.length === 0) return snapshot;
  const catalogRows = createdProducts.map(buildCatalogRow);
  patchLoadedArrayQuery<CatalogProduct>(
    queryClient,
    queryKeys.catalogProducts,
    (current) => insertProducts(current, createdProducts),
  );
  patchLoadedArrayQuery<CatalogRow>(
    queryClient,
    queryKeys.overviewCatalog,
    (current) => insertProducts(current, catalogRows),
  );
  patchLoadedArrayQuery<CatalogRow>(
    queryClient,
    queryKeys.indexingCatalog,
    (current) => insertProducts(current, catalogRows),
  );
  patchLoadedArrayQuery<CatalogProduct>(
    queryClient,
    queryKeys.reviewCatalog,
    (current) => insertProducts(current, createdProducts),
  );
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    queryKeys.reviewProductsIndex,
    (current) => insertReviewProducts(current, category, createdProducts),
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
