import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import type {
  ColorEditionFinderResult,
  AcceptedResponse,
  ColorEditionFinderDeleteRunResponse,
  ColorEditionFinderDeleteAllResponse,
} from '../types.ts';

export function useColorEditionFinderQuery(category: string, productId: string) {
  return useQuery<ColorEditionFinderResult>({
    queryKey: ['color-edition-finder', category, productId],
    queryFn: () => api.get<ColorEditionFinderResult>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

// WHY: No onSuccess invalidation — 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function useColorEditionFinderRunMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse>({
    mutationFn: () => api.post<AcceptedResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
  });
}

export function useDeleteColorEditionFinderRunMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['color-edition-finder', category, productId] });
    queryClient.invalidateQueries({ queryKey: ['colors'] });
  }, [queryClient, category, productId]);

  return useMutation<ColorEditionFinderDeleteRunResponse, Error, number>({
    mutationFn: (runNumber: number) => api.del<ColorEditionFinderDeleteRunResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${runNumber}`,
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteColorEditionFinderAllMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['color-edition-finder', category, productId] });
    queryClient.invalidateQueries({ queryKey: ['colors'] });
  }, [queryClient, category, productId]);

  return useMutation<ColorEditionFinderDeleteAllResponse>({
    mutationFn: () => api.del<ColorEditionFinderDeleteAllResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    onSuccess: invalidate,
  });
}
