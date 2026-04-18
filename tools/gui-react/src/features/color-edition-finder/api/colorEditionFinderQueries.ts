import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import { FINDER_PANELS } from '../../../features/indexing/state/finderPanelRegistry.generated.ts';
import type {
  ColorEditionFinderResult,
  AcceptedResponse,
  ColorEditionFinderDeleteRunResponse,
  ColorEditionFinderDeleteAllResponse,
  VariantDeleteResponse,
  VariantDeleteAllResponse,
} from '../types.ts';

// WHY: Variant delete cascades into every downstream finder (variantFieldProducer
// like RDF, variantArtifactProducer like PIF). Their panel queries must refetch
// or stale runs / discovery history badges keep showing. Derived from the
// registry so a new downstream finder is invalidated automatically.
function invalidateDownstreamFinderPanels(
  queryClient: QueryClient,
  category: string,
  productId: string,
): void {
  for (const panel of FINDER_PANELS) {
    if (panel.moduleClass === 'variantGenerator') continue;
    queryClient.invalidateQueries({ queryKey: [panel.routePrefix, category, productId] });
  }
}

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

  // WHY: CEF run delete strips field_candidates evidence sourced by that run
  // and re-derives published state. The review grid, candidate drawer, and
  // publisher query all read that projection — must refresh without a reload.
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['color-edition-finder', category, productId] });
    queryClient.invalidateQueries({ queryKey: ['colors'] });
    queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
    queryClient.invalidateQueries({ queryKey: ['product', category] });
    queryClient.invalidateQueries({ queryKey: ['candidates', category] });
    queryClient.invalidateQueries({ queryKey: ['publisher', 'published', category, productId] });
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

  // WHY: Delete-all-runs wipes every CEF-sourced candidate — same consumer set
  // as single-run delete must refresh (review grid / candidates / publisher).
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['color-edition-finder', category, productId] });
    queryClient.invalidateQueries({ queryKey: ['colors'] });
    queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
    queryClient.invalidateQueries({ queryKey: ['product', category] });
    queryClient.invalidateQueries({ queryKey: ['candidates', category] });
    queryClient.invalidateQueries({ queryKey: ['publisher', 'published', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<ColorEditionFinderDeleteAllResponse>({
    mutationFn: () => api.del<ColorEditionFinderDeleteAllResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteAllVariantsMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['color-edition-finder', category, productId] });
    queryClient.invalidateQueries({ queryKey: ['colors'] });
    queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
    queryClient.invalidateQueries({ queryKey: ['product', category] });
    queryClient.invalidateQueries({ queryKey: ['candidates', category] });
    queryClient.invalidateQueries({ queryKey: ['publisher', 'published', category, productId] });
    invalidateDownstreamFinderPanels(queryClient, category, productId);
  }, [queryClient, category, productId]);

  return useMutation<VariantDeleteAllResponse>({
    mutationFn: () => api.del<VariantDeleteAllResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/variants`,
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteVariantMutation(category: string, productId: string) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['color-edition-finder', category, productId] });
    queryClient.invalidateQueries({ queryKey: ['colors'] });
    queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
    queryClient.invalidateQueries({ queryKey: ['product', category] });
    queryClient.invalidateQueries({ queryKey: ['candidates', category] });
    queryClient.invalidateQueries({ queryKey: ['publisher', 'published', category, productId] });
    invalidateDownstreamFinderPanels(queryClient, category, productId);
  }, [queryClient, category, productId]);

  return useMutation<VariantDeleteResponse, Error, string>({
    mutationFn: (variantId: string) => api.del<VariantDeleteResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    ),
    onSuccess: invalidate,
  });
}
