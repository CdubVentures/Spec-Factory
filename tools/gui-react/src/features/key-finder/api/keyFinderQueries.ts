/**
 * keyFinder React Query hooks - hand-written (not codegen).
 *
 * Deviates from the SKU/RDF codegen pattern because keyFinder's mutation body
 * is `{ field_key, mode }` (not `{ variant_key, variant_id }`) and there's no
 * /loop endpoint yet (Phase 3b). Query keys are prefixed `['key-finder', ...]`
 * so the invalidationResolver auto-invalidates on `key-finder-*` WS events.
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import type {
  KeyFinderSummaryRow,
  KeyFinderAllRunsResponse,
  ReservedKeysResponse,
} from '../types.ts';

export function useReservedKeysQuery(category: string) {
  return useQuery<ReservedKeysResponse>({
    queryKey: ['key-finder', category, 'reserved'],
    queryFn: () => api.get<ReservedKeysResponse>(
      `/key-finder/${encodeURIComponent(category)}/reserved-keys`,
    ),
    enabled: Boolean(category),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export interface BundlingConfig {
  readonly enabled: boolean;
  readonly alwaysSoloRun: boolean;
  readonly groupBundlingOnly: boolean;
  readonly passengerDifficultyPolicy: string;
  readonly poolPerPrimary: Record<string, number>;
  readonly passengerCost: Record<string, number>;
  readonly passengerVariantCostPerExtra: number;
  /** Product-family size used by backend budget/passenger surcharge math. */
  readonly familySize: number;
  readonly overlapCaps: Record<string, number>;
  readonly sortAxisOrder: string;
}

export function useKeyFinderBundlingConfigQuery(category: string, productId: string) {
  return useQuery<BundlingConfig>({
    queryKey: ['key-finder', category, productId, 'bundling-config'],
    queryFn: () => api.get<BundlingConfig>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/bundling-config`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

export function useKeyFinderSummaryQuery(category: string, productId: string) {
  return useQuery<readonly KeyFinderSummaryRow[]>({
    queryKey: ['key-finder', category, productId, 'summary'],
    queryFn: () => api.get<readonly KeyFinderSummaryRow[]>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/summary`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

export function useKeyFinderAllRunsQuery(category: string, productId: string) {
  return useQuery<KeyFinderAllRunsResponse>({
    queryKey: ['key-finder', category, productId, 'all-runs'],
    queryFn: () => api.get<KeyFinderAllRunsResponse>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

interface DeleteRunBody { readonly runNumber: number; readonly fieldKey: string }

export function useDeleteKeyFinderRunMutation(category: string, productId: string) {
  return useDataChangeMutation<{ ok: boolean }, Error, DeleteRunBody>({
    event: 'key-finder-run-deleted',
    category,
    mutationFn: ({ runNumber, fieldKey }) => api.del<{ ok: boolean }>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${encodeURIComponent(String(runNumber))}?field_key=${encodeURIComponent(fieldKey)}`,
    ),
  });
}

export function useDeleteAllKeyFinderRunsMutation(category: string, productId: string) {
  return useDataChangeMutation<{ ok: boolean }>({
    event: 'key-finder-deleted',
    category,
    mutationFn: () => api.del<{ ok: boolean }>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
  });
}

interface UnpubResponse { readonly status: 'unpublished'; readonly field_key: string }
interface DeleteFieldResponse { readonly status: 'deleted'; readonly field_key: string }

export function useUnpublishKeyMutation(category: string, productId: string) {
  return useDataChangeMutation<UnpubResponse, Error, { readonly fieldKey: string }>({
    event: 'key-finder-unpublished',
    category,
    mutationFn: ({ fieldKey }) => api.post<UnpubResponse>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/keys/${encodeURIComponent(fieldKey)}/unpublish`,
      {},
    ),
  });
}

export function useDeleteKeyMutation(category: string, productId: string) {
  return useDataChangeMutation<DeleteFieldResponse, Error, { readonly fieldKey: string }>({
    event: 'key-finder-field-deleted',
    category,
    mutationFn: ({ fieldKey }) => api.del<DeleteFieldResponse>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/keys/${encodeURIComponent(fieldKey)}`,
    ),
  });
}
