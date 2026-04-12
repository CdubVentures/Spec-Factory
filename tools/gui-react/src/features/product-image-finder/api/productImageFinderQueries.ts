import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import type {
  ProductImageFinderResult,
  ProductImageFinderRunResponse,
  ProductImageFinderLoopResponse,
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

export function useProductImageFinderRunMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderRunResponse, Error, { variant_key?: string; mode?: 'view' | 'hero' }>({
    mutationFn: (body) => api.post<ProductImageFinderRunResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      body,
    ),
    onSuccess: invalidate,
  });
}

export function useProductImageFinderLoopMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderLoopResponse, Error, { variant_key?: string }>({
    mutationFn: (body) => api.post<ProductImageFinderLoopResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/loop`,
      body,
    ),
    onSuccess: invalidate,
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
