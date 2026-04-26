import { useQuery, useMutation, type QueryKey } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import { FINDER_PANELS } from '../../../features/indexing/state/finderPanelRegistry.generated.ts';
import type {
  ColorEditionFinderResult,
  AcceptedResponse,
  ColorEditionFinderDeleteRunResponse,
  ColorEditionFinderDeleteAllResponse,
  VariantDeleteResponse,
  VariantDeleteAllResponse,
} from '../types.ts';

// WHY: Variant delete cascades into every downstream finder. Product-exact
// query keys preserve the previous immediate-refresh behavior for the active row.
function downstreamFinderPanelQueryKeys(
  category: string,
  productId: string,
): readonly QueryKey[] {
  return FINDER_PANELS
    .filter((panel) => panel.moduleClass !== 'variantGenerator')
    .map((panel) => [panel.routePrefix, category, productId] as const);
}

function colorEditionDeleteQueryKeys(category: string, productId: string): readonly QueryKey[] {
  return [
    ['colors'],
    ['publisher', 'published', category, productId],
  ];
}

function variantDeleteQueryKeys(category: string, productId: string): readonly QueryKey[] {
  return [
    ...colorEditionDeleteQueryKeys(category, productId),
    ...downstreamFinderPanelQueryKeys(category, productId),
  ];
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

// WHY: No onSuccess invalidation. 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function useColorEditionFinderRunMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse>({
    mutationFn: () => api.post<AcceptedResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
  });
}

export function useDeleteColorEditionFinderRunMutation(category: string, productId: string) {
  return useDataChangeMutation<ColorEditionFinderDeleteRunResponse, Error, number>({
    event: 'color-edition-finder-run-deleted',
    category,
    mutationFn: (runNumber: number) => api.del<ColorEditionFinderDeleteRunResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${runNumber}`,
    ),
    extraQueryKeys: colorEditionDeleteQueryKeys(category, productId),
  });
}

export function useDeleteColorEditionFinderAllMutation(category: string, productId: string) {
  return useDataChangeMutation<ColorEditionFinderDeleteAllResponse>({
    event: 'color-edition-finder-deleted',
    category,
    mutationFn: () => api.del<ColorEditionFinderDeleteAllResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    extraQueryKeys: colorEditionDeleteQueryKeys(category, productId),
  });
}

export function useDeleteAllVariantsMutation(category: string, productId: string) {
  return useDataChangeMutation<VariantDeleteAllResponse>({
    event: 'color-edition-finder-variants-deleted-all',
    category,
    mutationFn: () => api.del<VariantDeleteAllResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/variants`,
    ),
    extraQueryKeys: variantDeleteQueryKeys(category, productId),
  });
}

export function useDeleteVariantMutation(category: string, productId: string) {
  return useDataChangeMutation<VariantDeleteResponse, Error, string>({
    event: 'color-edition-finder-variant-deleted',
    category,
    mutationFn: (variantId: string) => api.del<VariantDeleteResponse>(
      `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
    ),
    extraQueryKeys: variantDeleteQueryKeys(category, productId),
  });
}
