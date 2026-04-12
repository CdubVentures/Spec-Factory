import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import type {
  ProductImageFinderResult,
  ProductImageFinderRunResponse,
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

  return useMutation<ProductImageFinderRunResponse, Error, { variant_key?: string }>({
    mutationFn: (body) => api.post<ProductImageFinderRunResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      body,
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteProductImageFinderRunMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderDeleteResponse, Error, number>({
    mutationFn: (runNumber: number) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${runNumber}`,
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteProductImageMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderDeleteResponse, Error, string>({
    mutationFn: (filename: string) => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/images/${encodeURIComponent(filename)}`,
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteProductImageFinderAllMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-image-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ProductImageFinderDeleteResponse>({
    mutationFn: () => api.del<ProductImageFinderDeleteResponse>(
      `/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    onSuccess: invalidate,
  });
}
