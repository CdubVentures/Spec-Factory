import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import type { ColorEditionFinderResult, ColorEditionFinderRunResponse } from '../types.ts';

export function useColorEditionFinderQuery(category: string, productId: string) {
  return useQuery<ColorEditionFinderResult>({
    queryKey: ['color-edition-finder', category, productId],
    queryFn: () => api.get<ColorEditionFinderResult>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(category) && Boolean(productId),
    refetchInterval: 10_000,
  });
}

export function useColorEditionFinderRunMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['color-edition-finder', category, productId] });
    queryClient.invalidateQueries({ queryKey: ['colors'] });
  }, [queryClient, category, productId]);

  return useMutation<ColorEditionFinderRunResponse>({
    mutationFn: () => api.post<ColorEditionFinderRunResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    onSuccess: invalidate,
  });
}
