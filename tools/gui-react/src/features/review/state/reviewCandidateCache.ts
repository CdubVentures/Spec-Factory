import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type {
  CandidateResponse,
  FieldState,
  ProductsIndexResponse,
  ReviewCandidate,
} from '../../../types/review.ts';

export interface ReviewCandidateCacheTarget {
  readonly category: string;
  readonly productId: string;
  readonly field: string;
}

export interface ReviewFieldRowCacheTarget {
  readonly category: string;
  readonly field: string;
}

export interface ReviewFieldValueSourceMeta {
  readonly source?: string;
  readonly method?: string;
  readonly tier?: number | null;
  readonly acceptedCandidateId?: string | null;
}

export interface ReviewFieldValueCacheTarget extends ReviewCandidateCacheTarget {
  readonly value: unknown;
  readonly timestamp: string;
  readonly sourceMeta?: ReviewFieldValueSourceMeta;
}

export interface ReviewCandidateSourceTarget extends ReviewCandidateCacheTarget {
  readonly sourceId: string;
}

export interface ReviewCandidateCacheSnapshot {
  readonly candidateData: CandidateResponse | undefined;
  readonly productsIndex: ProductsIndexResponse | undefined;
}

interface ReviewFieldRowCandidateCacheSnapshot {
  readonly queryKey: QueryKey;
  readonly data: CandidateResponse | undefined;
}

export interface ReviewFieldRowCacheSnapshot {
  readonly productsIndexQueryKey: QueryKey;
  readonly productsIndex: ProductsIndexResponse | undefined;
  readonly candidateData: readonly ReviewFieldRowCandidateCacheSnapshot[];
}

export interface ReviewFieldValueCacheSnapshot {
  readonly productsIndexQueryKey: QueryKey;
  readonly productsIndex: ProductsIndexResponse | undefined;
}

export function buildReviewCandidateQueryKey({
  category,
  productId,
  field,
}: ReviewCandidateCacheTarget) {
  return ['candidates', category, productId, field] as const;
}

function buildReviewProductsIndexQueryKey(category: string) {
  return ['reviewProductsIndex', category] as const;
}

function filterCandidatesBySourceId(
  candidates: readonly ReviewCandidate[],
  sourceId: string,
): ReviewCandidate[] {
  return candidates.filter((candidate) => candidate.source_id !== sourceId);
}

function patchCandidateResponseBySourceId(
  data: CandidateResponse | undefined,
  sourceId: string,
): CandidateResponse | undefined {
  if (!data) return data;
  const candidates = filterCandidatesBySourceId(data.candidates ?? [], sourceId);
  return {
    ...data,
    candidates,
    candidate_count: candidates.length,
  };
}

function clearCandidateResponse(
  data: CandidateResponse | undefined,
): CandidateResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    candidates: [],
    candidate_count: 0,
  };
}

function patchFieldCandidatesBySourceId(
  fieldState: FieldState,
  sourceId: string,
): FieldState {
  if (fieldState.candidates.length > 0) {
    const candidates = filterCandidatesBySourceId(fieldState.candidates, sourceId);
    return {
      ...fieldState,
      candidates,
      candidate_count: candidates.length,
    };
  }

  return {
    ...fieldState,
    candidate_count: Math.max(0, fieldState.candidate_count - 1),
  };
}

function clearFieldCandidates(fieldState: FieldState): FieldState {
  return {
    ...fieldState,
    candidates: [],
    candidate_count: 0,
  };
}

function buildEmptyFieldState(): FieldState {
  return {
    selected: {
      value: null,
      confidence: 0,
      status: 'ok',
      color: 'gray',
    },
    candidate_count: 0,
    candidates: [],
  };
}

function clearFieldSelection(fieldState: FieldState): FieldState {
  const { selected } = fieldState;
  const {
    overridden: _overridden,
    source: _source,
    source_timestamp: _sourceTimestamp,
    method: _method,
    tier: _tier,
    evidence_url: _evidenceUrl,
    evidence_quote: _evidenceQuote,
    accepted_candidate_id: _acceptedCandidateId,
    selected_candidate_id: _selectedCandidateId,
    variant_values: _variantValues,
    ...rest
  } = fieldState;

  return {
    ...rest,
    selected: {
      value: null,
      ...(selected.unit !== undefined ? { unit: selected.unit } : {}),
      confidence: 0,
      status: 'ok',
      color: 'gray',
    },
  };
}

function applyFieldValue(fieldState: FieldState | undefined, target: ReviewFieldValueCacheTarget): FieldState {
  const existing = fieldState ?? buildEmptyFieldState();
  const isManualOverride = target.sourceMeta?.method === 'manual_override';
  return {
    ...existing,
    selected: {
      value: target.value,
      confidence: 1,
      status: 'ok',
      color: 'green',
    },
    overridden: isManualOverride,
    source_timestamp: target.timestamp,
    ...(target.sourceMeta?.source !== undefined ? { source: target.sourceMeta.source } : {}),
    ...(target.sourceMeta?.method !== undefined ? { method: target.sourceMeta.method } : {}),
    ...(target.sourceMeta?.tier !== undefined ? { tier: target.sourceMeta.tier } : {}),
    ...(target.sourceMeta?.acceptedCandidateId !== undefined
      ? { accepted_candidate_id: target.sourceMeta.acceptedCandidateId }
      : {}),
  };
}

function patchProductsIndexField(
  data: ProductsIndexResponse | undefined,
  target: ReviewCandidateCacheTarget,
  patchField: (fieldState: FieldState) => FieldState,
): ProductsIndexResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    products: data.products.map((product) => {
      if (product.product_id !== target.productId) return product;
      const fieldState = product.fields[target.field];
      if (!fieldState) return product;
      return {
        ...product,
        fields: {
          ...product.fields,
          [target.field]: patchField(fieldState),
        },
      };
    }),
  };
}

function patchProductsIndexProductField(
  data: ProductsIndexResponse | undefined,
  target: ReviewCandidateCacheTarget,
  patchField: (fieldState: FieldState | undefined) => FieldState | undefined,
): ProductsIndexResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    products: data.products.map((product) => {
      if (product.product_id !== target.productId) return product;
      const nextField = patchField(product.fields[target.field]);
      if (nextField) {
        return {
          ...product,
          fields: {
            ...product.fields,
            [target.field]: nextField,
          },
        };
      }
      const { [target.field]: _removed, ...fields } = product.fields;
      return { ...product, fields };
    }),
  };
}

function patchProductsIndexFieldRow(
  data: ProductsIndexResponse | undefined,
  target: ReviewFieldRowCacheTarget,
  patchField: (fieldState: FieldState) => FieldState | undefined,
): ProductsIndexResponse | undefined {
  if (!data) return data;
  return {
    ...data,
    products: data.products.map((product) => {
      const fieldState = product.fields[target.field];
      if (!fieldState) return product;
      const nextField = patchField(fieldState);
      if (nextField) {
        return {
          ...product,
          fields: {
            ...product.fields,
            [target.field]: nextField,
          },
        };
      }
      const { [target.field]: _removed, ...fields } = product.fields;
      return { ...product, fields };
    }),
  };
}

function readReviewFieldValueCacheSnapshot(
  queryClient: QueryClient,
  category: string,
): ReviewFieldValueCacheSnapshot {
  const productsIndexQueryKey = buildReviewProductsIndexQueryKey(category);
  return {
    productsIndexQueryKey,
    productsIndex: queryClient.getQueryData<ProductsIndexResponse>(
      productsIndexQueryKey,
    ),
  };
}

function readFieldRowProductIds(data: ProductsIndexResponse | undefined): string[] {
  if (!data) return [];
  return Array.from(new Set(data.products.map((product) => product.product_id)));
}

function readFieldRowCandidateCacheSnapshots(
  queryClient: QueryClient,
  target: ReviewFieldRowCacheTarget,
  productIds: readonly string[],
): ReviewFieldRowCandidateCacheSnapshot[] {
  return productIds.map((productId) => {
    const queryKey = buildReviewCandidateQueryKey({
      category: target.category,
      productId,
      field: target.field,
    });
    return {
      queryKey,
      data: queryClient.getQueryData<CandidateResponse>(queryKey),
    };
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

export async function cancelReviewCandidateCacheQueries(
  queryClient: QueryClient,
  target: ReviewCandidateCacheTarget,
): Promise<void> {
  await Promise.all([
    queryClient.cancelQueries({
      queryKey: buildReviewCandidateQueryKey(target),
      exact: true,
    }),
    queryClient.cancelQueries({
      queryKey: buildReviewProductsIndexQueryKey(target.category),
      exact: true,
    }),
  ]);
}

export async function cancelReviewFieldValueCacheQueries(
  queryClient: QueryClient,
  target: ReviewCandidateCacheTarget,
): Promise<void> {
  await queryClient.cancelQueries({
    queryKey: buildReviewProductsIndexQueryKey(target.category),
    exact: true,
  });
}

export async function cancelReviewFieldRowCacheQueries(
  queryClient: QueryClient,
  target: ReviewFieldRowCacheTarget,
): Promise<void> {
  const productsIndex = queryClient.getQueryData<ProductsIndexResponse>(
    buildReviewProductsIndexQueryKey(target.category),
  );
  const candidateCancelTasks = readFieldRowProductIds(productsIndex).map((productId) =>
    queryClient.cancelQueries({
      queryKey: buildReviewCandidateQueryKey({
        category: target.category,
        productId,
        field: target.field,
      }),
      exact: true,
    }),
  );

  await Promise.all([
    queryClient.cancelQueries({
      queryKey: buildReviewProductsIndexQueryKey(target.category),
      exact: true,
    }),
    ...candidateCancelTasks,
  ]);
}

export function readReviewCandidateCacheSnapshot(
  queryClient: QueryClient,
  target: ReviewCandidateCacheTarget,
): ReviewCandidateCacheSnapshot {
  return {
    candidateData: queryClient.getQueryData<CandidateResponse>(
      buildReviewCandidateQueryKey(target),
    ),
    productsIndex: queryClient.getQueryData<ProductsIndexResponse>(
      buildReviewProductsIndexQueryKey(target.category),
    ),
  };
}

export function readReviewFieldRowCacheSnapshot(
  queryClient: QueryClient,
  target: ReviewFieldRowCacheTarget,
): ReviewFieldRowCacheSnapshot {
  const productsIndexQueryKey = buildReviewProductsIndexQueryKey(target.category);
  const productsIndex = queryClient.getQueryData<ProductsIndexResponse>(
    productsIndexQueryKey,
  );
  return {
    productsIndexQueryKey,
    productsIndex,
    candidateData: readFieldRowCandidateCacheSnapshots(
      queryClient,
      target,
      readFieldRowProductIds(productsIndex),
    ),
  };
}

export function restoreReviewCandidateCaches(
  queryClient: QueryClient,
  category: string,
  productId: string,
  field: string,
  snapshot: ReviewCandidateCacheSnapshot,
): void {
  const target = { category, productId, field };
  restoreQueryData(queryClient, buildReviewCandidateQueryKey(target), snapshot.candidateData);
  restoreQueryData(queryClient, buildReviewProductsIndexQueryKey(category), snapshot.productsIndex);
}

export function restoreReviewFieldValueCaches(
  queryClient: QueryClient,
  snapshot: ReviewFieldValueCacheSnapshot,
): void {
  restoreQueryData(queryClient, snapshot.productsIndexQueryKey, snapshot.productsIndex);
}

export function restoreReviewFieldRowCaches(
  queryClient: QueryClient,
  snapshot: ReviewFieldRowCacheSnapshot,
): void {
  restoreQueryData(queryClient, snapshot.productsIndexQueryKey, snapshot.productsIndex);
  for (const entry of snapshot.candidateData) {
    restoreQueryData(queryClient, entry.queryKey, entry.data);
  }
}

export function removeReviewCandidateFromCaches(
  queryClient: QueryClient,
  target: ReviewCandidateSourceTarget,
): ReviewCandidateCacheSnapshot {
  const snapshot = readReviewCandidateCacheSnapshot(queryClient, target);
  queryClient.setQueryData<CandidateResponse | undefined>(
    buildReviewCandidateQueryKey(target),
    (current) => patchCandidateResponseBySourceId(current, target.sourceId),
  );
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    buildReviewProductsIndexQueryKey(target.category),
    (current) => patchProductsIndexField(
      current,
      target,
      (fieldState) => patchFieldCandidatesBySourceId(fieldState, target.sourceId),
    ),
  );
  return snapshot;
}

export function updateReviewFieldValueInCaches(
  queryClient: QueryClient,
  target: ReviewFieldValueCacheTarget,
): ReviewFieldValueCacheSnapshot {
  const snapshot = readReviewFieldValueCacheSnapshot(queryClient, target.category);
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    buildReviewProductsIndexQueryKey(target.category),
    (current) => patchProductsIndexProductField(
      current,
      target,
      (fieldState) => applyFieldValue(fieldState, target),
    ),
  );
  return snapshot;
}

export function clearPublishedReviewFieldFromCaches(
  queryClient: QueryClient,
  target: ReviewCandidateCacheTarget,
): ReviewFieldValueCacheSnapshot {
  const snapshot = readReviewFieldValueCacheSnapshot(queryClient, target.category);
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    buildReviewProductsIndexQueryKey(target.category),
    (current) => patchProductsIndexProductField(
      current,
      target,
      (fieldState) => (fieldState ? clearFieldSelection(fieldState) : undefined),
    ),
  );
  return snapshot;
}

export function unpublishReviewFieldRowFromCaches(
  queryClient: QueryClient,
  target: ReviewFieldRowCacheTarget,
): ReviewFieldRowCacheSnapshot {
  const snapshot = readReviewFieldRowCacheSnapshot(queryClient, target);
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    buildReviewProductsIndexQueryKey(target.category),
    (current) => patchProductsIndexFieldRow(current, target, clearFieldSelection),
  );
  return snapshot;
}

export function deleteReviewFieldRowFromCaches(
  queryClient: QueryClient,
  target: ReviewFieldRowCacheTarget,
): ReviewFieldRowCacheSnapshot {
  const snapshot = readReviewFieldRowCacheSnapshot(queryClient, target);
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    buildReviewProductsIndexQueryKey(target.category),
    (current) => patchProductsIndexFieldRow(current, target, () => undefined),
  );
  for (const entry of snapshot.candidateData) {
    queryClient.setQueryData<CandidateResponse | undefined>(
      entry.queryKey,
      clearCandidateResponse,
    );
  }
  return snapshot;
}

export function removeAllReviewCandidatesFromCaches(
  queryClient: QueryClient,
  target: ReviewCandidateCacheTarget,
): ReviewCandidateCacheSnapshot {
  const snapshot = readReviewCandidateCacheSnapshot(queryClient, target);
  queryClient.setQueryData<CandidateResponse | undefined>(
    buildReviewCandidateQueryKey(target),
    clearCandidateResponse,
  );
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    buildReviewProductsIndexQueryKey(target.category),
    (current) => patchProductsIndexField(current, target, clearFieldCandidates),
  );
  return snapshot;
}
