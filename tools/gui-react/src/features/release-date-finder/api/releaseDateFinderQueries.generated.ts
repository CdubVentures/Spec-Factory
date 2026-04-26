// AUTO-GENERATED from finderModuleRegistry.js (entry: releaseDateFinder).
// Run: node tools/gui-react/scripts/generateFinderHooks.js releaseDateFinder
// Do not edit manually.

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import type { ReleaseDateFinderResult } from '../types.generated.ts';

export interface AcceptedResponse {
  readonly status: 'accepted';
  readonly operationId: string;
}

export interface ReleaseDateFinderDeleteResponse {
  readonly ok: boolean;
  readonly remaining_runs?: number;
}

export function useReleaseDateFinderQuery(category: string, productId: string) {
  return useQuery<ReleaseDateFinderResult>({
    queryKey: ['release-date-finder', category, productId],
    queryFn: () => api.get<ReleaseDateFinderResult>(
      `/release-date-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

// WHY: No onSuccess invalidation — 202 means work is queued, not complete.
// WS data-change events invalidate queries when background work finishes.
export function useReleaseDateFinderRunMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      `/release-date-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      body,
    ),
  });
}

// Loop: retries per variant up to perVariantAttemptBudget until the candidate
// reaches the publisher gate or LLM returns definitive unknown.
export function useReleaseDateFinderLoopMutation(category: string, productId: string) {
  return useMutation<AcceptedResponse, Error, { variant_key?: string; variant_id?: string }>({
    mutationFn: (body) => api.post<AcceptedResponse>(
      `/release-date-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/loop`,
      body,
    ),
  });
}

export function useDeleteReleaseDateFinderRunMutation(category: string, productId: string) {
  return useDataChangeMutation<ReleaseDateFinderDeleteResponse, Error, number>({
    event: 'release-date-finder-run-deleted',
    category,
    mutationFn: (runNumber: number) => api.del<ReleaseDateFinderDeleteResponse>(
      `/release-date-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${runNumber}`,
    ),
    removeQueryKeys: [['release-date-finder', category, productId]],
  });
}

export function useDeleteReleaseDateFinderAllMutation(category: string, productId: string) {
  return useDataChangeMutation<ReleaseDateFinderDeleteResponse>({
    event: 'release-date-finder-deleted',
    category,
    mutationFn: () => api.del<ReleaseDateFinderDeleteResponse>(
      `/release-date-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    removeQueryKeys: [['release-date-finder', category, productId]],
  });
}
