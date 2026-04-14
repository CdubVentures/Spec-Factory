import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import type {
  ProductImageFinderResult,
  AcceptedResponse,
  ProductImageFinderDeleteResponse,
} from '../types.ts';

export function useProductImageFinderQuery(category: string, productId: string) {
  return useQuery<ProductImageFinderResult>({
    queryKey: ['product-image-finder', category, productId],
    queryFn: () => api.get<ProductImageFinderResult>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

// WHY: No onSuccess invalidation — 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function useProductImageFinderRunMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string; mode?: 'view' | 'hero' }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      body,
    ),
  });
}

// WHY: No onSuccess invalidation — 202 means work is queued, not complete.
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
  const queryClient = useQueryClient();

  const resetQuery = useCallback(() => {
    // WHY: removeQueries clears stale cache immediately. invalidateQueries
    // would refetch, but if no runs remain the GET returns 404 and React Query
    // keeps ghost data from the stale cache.
    queryClient.removeQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderDeleteResponse, Error, number>({
    mutationFn: (runNumber: number) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${runNumber}`,
    ),
    onSuccess: resetQuery,
  });
}

export function useDeleteProductImageFinderRunsBatchMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const resetQuery = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderDeleteResponse, Error, readonly number[]>({
    mutationFn: (runNumbers: readonly number[]) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/batch`,
      { runNumbers },
    ),
    onSuccess: resetQuery,
  });
}

export function useDeleteProductImageMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const resetQuery = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderDeleteResponse, Error, string>({
    mutationFn: (filename: string) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/images/${encodeURIComponent(filename)}`,
    ),
    onSuccess: resetQuery,
  });
}

export function useProcessProductImageMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<{ ok: boolean; bg_removed: boolean; filename: string }, Error, string>({
    mutationFn: (filename: string) => api.post<{ ok: boolean; bg_removed: boolean; filename: string }>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/images/${encodeURIComponent(filename)}/process`,
    ),
    onSuccess: invalidate,
  });
}

// WHY: No onSuccess invalidation — 202 means work is queued, not complete.
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

  const resetQuery = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderDeleteResponse>({
    mutationFn: () => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    onSuccess: resetQuery,
  });
}

export function useCarouselSlotMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<{ ok: boolean; carousel_slots: Record<string, Record<string, string | null>> }, Error, { variant_key: string; variant_id?: string; slot: string; filename: string | null }>({
    mutationFn: (body) => api.patch<{ ok: boolean; carousel_slots: Record<string, Record<string, string | null>> }>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/carousel-slot`,
      body,
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteEvalRecordMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<{ ok: boolean; remaining: number }, Error, number>({
    mutationFn: (evalNumber: number) => api.del<{ ok: boolean; remaining: number }>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/evaluations/${evalNumber}`,
    ),
    onSuccess: invalidate,
  });
}
