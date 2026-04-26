// AUTO-GENERATED from finderModuleRegistry.js (entry: skuFinder).
// Run: node tools/gui-react/scripts/generateFinderHooks.js skuFinder
// Do not edit manually.

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import type { SkuFinderResult } from '../types.generated.ts';

export interface AcceptedResponse {
  readonly status: 'accepted';
  readonly operationId: string;
}

export interface SkuFinderDeleteResponse {
  readonly ok: boolean;
  readonly remaining_runs?: number;
}

export function useSkuFinderQuery(category: string, productId: string) {
  return useQuery<SkuFinderResult>({
    queryKey: ['sku-finder', category, productId],
    queryFn: () => api.get<SkuFinderResult>(
      `/sku-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

// WHY: No onSuccess invalidation — 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function useSkuFinderRunMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      `/sku-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      body,
    ),
  });
}

// Loop: retries per variant up to perVariantAttemptBudget until the candidate
// reaches the publisher gate or LLM returns definitive unknown.
export function useSkuFinderLoopMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      `/sku-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/loop`,
      body,
    ),
  });
}

export function useDeleteSkuFinderRunMutation(category: string, productId: string) {
  return useDataChangeMutation<SkuFinderDeleteResponse, Error, number>({
    event: 'sku-finder-run-deleted',
    category,
    mutationFn: (runNumber: number) => api.del<SkuFinderDeleteResponse>(
      `/sku-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${runNumber}`,
    ),
    removeQueryKeys: [['sku-finder', category, productId]],
  });
}

export function useDeleteSkuFinderAllMutation(category: string, productId: string) {
  return useDataChangeMutation<SkuFinderDeleteResponse>({
    event: 'sku-finder-deleted',
    category,
    mutationFn: () => api.del<SkuFinderDeleteResponse>(
      `/sku-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    removeQueryKeys: [['sku-finder', category, productId]],
  });
}
