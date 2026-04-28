import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import { removeImageFromResult, removeImagesFromResult } from '../selectors/pifSelectors.ts';
import {
  applyPifCarouselClearServerState,
  clearPifCarouselSelections,
  decrementCatalogPifProgressForRemovedImages,
  removeImagesFromPifSummary,
  zeroCatalogPifCarouselProgress,
  zeroCatalogPifProgress,
} from '../state/pifDeleteOptimism.ts';
import type { CatalogRow } from '../../../types/product.ts';
import type {
  ProductImageFinderResult,
  ProductImageDependencyStatus,
  AcceptedResponse,
  ProductImageFinderDeleteResponse,
  ProductImageFinderSummary,
} from '../types.ts';

function productImageFinderQueryKey(category: string, productId: string) {
  return ['product-image-finder', category, productId] as const;
}

function productImageFinderSummaryQueryKey(category: string, productId: string) {
  return ['product-image-finder', category, productId, 'summary'] as const;
}

function collectDeletedImageRefs(
  filenames: readonly string[],
  result: ProductImageFinderResult | undefined,
  summary: ProductImageFinderSummary | undefined,
) {
  const filenameSet = new Set(filenames.map((filename) => String(filename || '').trim()).filter(Boolean));
  if (filenameSet.size === 0) return [];

  const refs = [
    ...(result?.images ?? []),
    ...(result?.selected?.images ?? []),
    ...(summary?.images ?? []),
  ].filter((image) => filenameSet.has(image.filename));

  const seen = new Set<string>();
  return refs.filter((image) => {
    const signature = `${image.filename}|${image.variant_id || ''}|${image.variant_key || ''}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export interface DeleteProductImagesVariables {
  readonly filenames: readonly string[];
  readonly scope: 'all' | 'variant' | 'files';
  readonly variantKey?: string;
}

interface DeleteProductImagesMutationContext {
  readonly previousResult: ProductImageFinderResult | undefined;
  readonly previousSummary: ProductImageFinderSummary | undefined;
  readonly previousCatalog: CatalogRow[] | undefined;
}

interface DeleteProductImageMutationContext {
  readonly previousResult: ProductImageFinderResult | undefined;
  readonly previousSummary: ProductImageFinderSummary | undefined;
  readonly previousCatalog: CatalogRow[] | undefined;
}

interface DeleteProductImageFinderAllMutationContext {
  readonly previousCatalog: CatalogRow[] | undefined;
}

interface ClearCarouselMutationContext {
  readonly previousResult: ProductImageFinderResult | undefined;
  readonly previousSummary: ProductImageFinderSummary | undefined;
  readonly previousCatalog: CatalogRow[] | undefined;
}

type CarouselClearResponse = {
  readonly ok: boolean;
  readonly productId: string;
  readonly category: string;
  readonly carousel_slots: Record<string, Record<string, string | null>>;
  readonly eval_state?: Record<string, unknown>;
};

interface ClearCarouselWinnersVariables {
  readonly variant_key: string;
  readonly variant_id?: string;
}

export function useProductImageFinderQuery(category: string, productId: string) {
  return useQuery<ProductImageFinderResult>({
    queryKey: productImageFinderQueryKey(category, productId),
    queryFn: () => api.get<ProductImageFinderResult>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

export function useProductImageDependenciesQuery(category: string, productId: string) {
  return useQuery<ProductImageDependencyStatus>({
    queryKey: [...productImageFinderQueryKey(category, productId), 'dependencies'] as const,
    queryFn: () => api.get<ProductImageDependencyStatus>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/dependencies`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

// WHY: No onSuccess invalidation. 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function useProductImageFinderRunMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string; mode?: 'view' | 'hero' }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      body,
    ),
  });
}

// WHY: No onSuccess invalidation. 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function useProductImageFinderLoopMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/loop`,
      body,
    ),
  });
}

export function useDeleteProductImageFinderRunMutation(category: string, productId: string) {
  return useDataChangeMutation<ProductImageFinderDeleteResponse, Error, number>({
    event: 'product-image-finder-run-deleted',
    category,
    mutationFn: (runNumber: number) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${runNumber}`,
    ),
    removeQueryKeys: [productImageFinderQueryKey(category, productId)],
  });
}

export function useDeleteProductImageFinderRunsBatchMutation(category: string, productId: string) {
  return useDataChangeMutation<ProductImageFinderDeleteResponse, Error, readonly number[]>({
    event: 'product-image-finder-run-deleted',
    category,
    mutationFn: (runNumbers: readonly number[]) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/batch`,
      { runNumbers },
    ),
    removeQueryKeys: [productImageFinderQueryKey(category, productId)],
  });
}

export function useDeleteProductImageMutation(category: string, productId: string) {
  const queryClient = useQueryClient();
  const queryKey = productImageFinderQueryKey(category, productId);
  const summaryQueryKey = productImageFinderSummaryQueryKey(category, productId);
  const catalogQueryKey = ['catalog', category] as const;

  return useDataChangeMutation<
    ProductImageFinderDeleteResponse,
    Error,
    string,
    DeleteProductImageMutationContext
  >({
    event: 'product-image-finder-image-deleted',
    category,
    resolveDataChangeMessage: () => ({ entities: { productIds: [productId] } }),
    mutationFn: (filename: string) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/images/${encodeURIComponent(filename)}`,
    ),
    options: {
      // WHY: Optimistic update removes the image from the UI instantly. The
      // data-change invalidation refreshes authoritative data after success.
      onMutate: (filename) => {
        const previousResult = queryClient.getQueryData<ProductImageFinderResult>(queryKey);
        const previousSummary = queryClient.getQueryData<ProductImageFinderSummary>(summaryQueryKey);
        const previousCatalog = queryClient.getQueryData<CatalogRow[]>(catalogQueryKey);
        const deletedImages = collectDeletedImageRefs([filename], previousResult, previousSummary);
        if (previousResult) {
          queryClient.setQueryData<ProductImageFinderResult>(queryKey, removeImageFromResult(previousResult, filename));
        }
        if (previousSummary) {
          queryClient.setQueryData<ProductImageFinderSummary | undefined>(
            summaryQueryKey,
            removeImagesFromPifSummary(previousSummary, [filename]),
          );
        }
        if (deletedImages.length > 0) {
          queryClient.setQueryData<CatalogRow[] | undefined>(
            catalogQueryKey,
            (current) => decrementCatalogPifProgressForRemovedImages(current, {
              productId,
              images: deletedImages,
            }),
          );
        }
        return { previousResult, previousSummary, previousCatalog };
      },
      onError: (_err, _filename, context) => {
        if (context?.previousResult) {
          queryClient.setQueryData<ProductImageFinderResult>(queryKey, context.previousResult);
        }
        if (context?.previousSummary) {
          queryClient.setQueryData<ProductImageFinderSummary>(summaryQueryKey, context.previousSummary);
        }
        if (context?.previousCatalog) {
          queryClient.setQueryData<CatalogRow[]>(catalogQueryKey, context.previousCatalog);
        }
      },
    },
  });
}

export function useDeleteProductImagesMutation(category: string, productId: string) {
  const queryClient = useQueryClient();
  const queryKey = productImageFinderQueryKey(category, productId);
  const summaryQueryKey = productImageFinderSummaryQueryKey(category, productId);
  const catalogQueryKey = ['catalog', category] as const;

  return useDataChangeMutation<
    ProductImageFinderDeleteResponse,
    Error,
    DeleteProductImagesVariables,
    DeleteProductImagesMutationContext
  >({
    event: 'product-image-finder-image-deleted',
    category,
    resolveDataChangeMessage: () => ({ entities: { productIds: [productId] } }),
    mutationFn: ({ filenames }) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/images`,
      { filenames },
    ),
    options: {
      onMutate: (variables) => {
        const filenames = [...variables.filenames];
        const previousResult = queryClient.getQueryData<ProductImageFinderResult>(queryKey);
        const previousSummary = queryClient.getQueryData<ProductImageFinderSummary>(summaryQueryKey);
        const previousCatalog = queryClient.getQueryData<CatalogRow[]>(catalogQueryKey);
        const deletedImages = collectDeletedImageRefs(filenames, previousResult, previousSummary);
        if (previousResult) {
          queryClient.setQueryData<ProductImageFinderResult>(queryKey, removeImagesFromResult(previousResult, filenames));
        }
        if (previousSummary) {
          queryClient.setQueryData<ProductImageFinderSummary | undefined>(
            summaryQueryKey,
            removeImagesFromPifSummary(previousSummary, filenames),
          );
        }
        if (variables.scope === 'all' || (variables.scope === 'variant' && variables.variantKey)) {
          queryClient.setQueryData<CatalogRow[] | undefined>(
            catalogQueryKey,
            (current) => zeroCatalogPifProgress(current, {
              productId,
              ...(variables.scope === 'variant' && variables.variantKey ? { variantKey: variables.variantKey } : {}),
            }),
          );
        } else if (deletedImages.length > 0) {
          queryClient.setQueryData<CatalogRow[] | undefined>(
            catalogQueryKey,
            (current) => decrementCatalogPifProgressForRemovedImages(current, {
              productId,
              images: deletedImages,
            }),
          );
        }
        return { previousResult, previousSummary, previousCatalog };
      },
      onError: (_err, _variables, context) => {
        if (context?.previousResult) {
          queryClient.setQueryData<ProductImageFinderResult>(queryKey, context.previousResult);
        }
        if (context?.previousSummary) {
          queryClient.setQueryData<ProductImageFinderSummary>(summaryQueryKey, context.previousSummary);
        }
        if (context?.previousCatalog) {
          queryClient.setQueryData<CatalogRow[]>(catalogQueryKey, context.previousCatalog);
        }
      },
    },
  });
}

export function useProcessProductImageMutation(category: string, productId: string) {
  return useDataChangeMutation<{ ok: boolean; bg_removed: boolean; filename: string }, Error, string>({
    event: 'product-image-finder-image-processed',
    category,
    mutationFn: (filename: string) => api.post<{ ok: boolean; bg_removed: boolean; filename: string }>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/images/${encodeURIComponent(filename)}/process`,
    ),
  });
}

// WHY: No onSuccess invalidation. 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function useProcessAllProductImagesMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error>({
    mutationFn: () => api.post<AcceptedResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/process-all`,
    ),
  });
}

export function useDeleteProductImageFinderAllMutation(category: string, productId: string) {
  const queryClient = useQueryClient();
  const catalogQueryKey = ['catalog', category] as const;

  return useDataChangeMutation<
    ProductImageFinderDeleteResponse,
    Error,
    void,
    DeleteProductImageFinderAllMutationContext
  >({
    event: 'product-image-finder-deleted',
    category,
    resolveDataChangeMessage: () => ({ entities: { productIds: [productId] } }),
    mutationFn: () => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    removeQueryKeys: [
      productImageFinderQueryKey(category, productId),
      productImageFinderSummaryQueryKey(category, productId),
    ],
    options: {
      onMutate: () => {
        const previousCatalog = queryClient.getQueryData<CatalogRow[]>(catalogQueryKey);
        queryClient.setQueryData<CatalogRow[] | undefined>(
          catalogQueryKey,
          (current) => zeroCatalogPifProgress(current, { productId }),
        );
        return { previousCatalog };
      },
      onError: (_err, _variables, context) => {
        if (context?.previousCatalog) {
          queryClient.setQueryData<CatalogRow[]>(catalogQueryKey, context.previousCatalog);
        }
      },
    },
  });
}

export function useCarouselSlotMutation(category: string, productId: string) {
  return useDataChangeMutation<
    { ok: boolean; carousel_slots: Record<string, Record<string, string | null>> },
    Error,
    { variant_key: string; variant_id?: string; slot: string; filename: string | null }
  >({
    event: 'product-image-finder-carousel-updated',
    category,
    mutationFn: (body) => api.patch<{ ok: boolean; carousel_slots: Record<string, Record<string, string | null>> }>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/carousel-slot`,
      body,
    ),
  });
}

export function useClearCarouselWinnersMutation(category: string, productId: string) {
  const queryClient = useQueryClient();
  const queryKey = productImageFinderQueryKey(category, productId);
  const summaryQueryKey = productImageFinderSummaryQueryKey(category, productId);
  const catalogQueryKey = ['catalog', category] as const;

  return useDataChangeMutation<
    CarouselClearResponse,
    Error,
    ClearCarouselWinnersVariables,
    ClearCarouselMutationContext
  >({
    event: 'product-image-finder-carousel-updated',
    category,
    mutationFn: (body) => api.post<CarouselClearResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/carousel-winners/clear`,
      body,
    ),
    options: {
      onMutate: (variables) => {
        const previousResult = queryClient.getQueryData<ProductImageFinderResult>(queryKey);
        const previousSummary = queryClient.getQueryData<ProductImageFinderSummary>(summaryQueryKey);
        const previousCatalog = queryClient.getQueryData<CatalogRow[]>(catalogQueryKey);
        const selector = { variantKey: variables.variant_key, variantId: variables.variant_id };
        if (previousResult) {
          queryClient.setQueryData<ProductImageFinderResult | undefined>(
            queryKey,
            clearPifCarouselSelections(previousResult, selector),
          );
        }
        if (previousSummary) {
          queryClient.setQueryData<ProductImageFinderSummary | undefined>(
            summaryQueryKey,
            clearPifCarouselSelections(previousSummary, selector),
          );
        }
        queryClient.setQueryData<CatalogRow[] | undefined>(
          catalogQueryKey,
          (current) => zeroCatalogPifCarouselProgress(current, {
            productId,
            variantKey: variables.variant_key,
          }),
        );
        return { previousResult, previousSummary, previousCatalog };
      },
      onError: (_err, _variables, context) => {
        if (context?.previousResult) {
          queryClient.setQueryData<ProductImageFinderResult>(queryKey, context.previousResult);
        }
        if (context?.previousSummary) {
          queryClient.setQueryData<ProductImageFinderSummary>(summaryQueryKey, context.previousSummary);
        }
        if (context?.previousCatalog) {
          queryClient.setQueryData<CatalogRow[]>(catalogQueryKey, context.previousCatalog);
        }
      },
      onSuccess: (data, variables) => {
        const selector = { variantKey: variables.variant_key, variantId: variables.variant_id };
        queryClient.setQueryData<ProductImageFinderResult | undefined>(
          queryKey,
          (current) => applyPifCarouselClearServerState(current, data, selector),
        );
        queryClient.setQueryData<ProductImageFinderSummary | undefined>(
          summaryQueryKey,
          (current) => applyPifCarouselClearServerState(current, data, selector),
        );
      },
    },
  });
}

export function useClearAllCarouselWinnersMutation(category: string, productId: string) {
  const queryClient = useQueryClient();
  const queryKey = productImageFinderQueryKey(category, productId);
  const summaryQueryKey = productImageFinderSummaryQueryKey(category, productId);
  const catalogQueryKey = ['catalog', category] as const;

  return useDataChangeMutation<
    CarouselClearResponse,
    Error,
    void,
    ClearCarouselMutationContext
  >({
    event: 'product-image-finder-carousel-updated',
    category,
    mutationFn: () => api.post<CarouselClearResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/carousel-winners/clear-all`,
    ),
    options: {
      onMutate: () => {
        const previousResult = queryClient.getQueryData<ProductImageFinderResult>(queryKey);
        const previousSummary = queryClient.getQueryData<ProductImageFinderSummary>(summaryQueryKey);
        const previousCatalog = queryClient.getQueryData<CatalogRow[]>(catalogQueryKey);
        if (previousResult) {
          queryClient.setQueryData<ProductImageFinderResult | undefined>(
            queryKey,
            clearPifCarouselSelections(previousResult),
          );
        }
        if (previousSummary) {
          queryClient.setQueryData<ProductImageFinderSummary | undefined>(
            summaryQueryKey,
            clearPifCarouselSelections(previousSummary),
          );
        }
        queryClient.setQueryData<CatalogRow[] | undefined>(
          catalogQueryKey,
          (current) => zeroCatalogPifCarouselProgress(current, { productId }),
        );
        return { previousResult, previousSummary, previousCatalog };
      },
      onError: (_err, _variables, context) => {
        if (context?.previousResult) {
          queryClient.setQueryData<ProductImageFinderResult>(queryKey, context.previousResult);
        }
        if (context?.previousSummary) {
          queryClient.setQueryData<ProductImageFinderSummary>(summaryQueryKey, context.previousSummary);
        }
        if (context?.previousCatalog) {
          queryClient.setQueryData<CatalogRow[]>(catalogQueryKey, context.previousCatalog);
        }
      },
      onSuccess: (data) => {
        queryClient.setQueryData<ProductImageFinderResult | undefined>(
          queryKey,
          (current) => applyPifCarouselClearServerState(current, data),
        );
        queryClient.setQueryData<ProductImageFinderSummary | undefined>(
          summaryQueryKey,
          (current) => applyPifCarouselClearServerState(current, data),
        );
      },
    },
  });
}

export function useDeleteEvalRecordMutation(category: string, productId: string) {
  return useDataChangeMutation<{ ok: boolean; remaining: number }, Error, number>({
    event: 'product-image-finder-evaluate',
    category,
    mutationFn: (evalNumber: number) => api.del<{ ok: boolean; remaining: number }>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/evaluations/${evalNumber}`,
    ),
  });
}
