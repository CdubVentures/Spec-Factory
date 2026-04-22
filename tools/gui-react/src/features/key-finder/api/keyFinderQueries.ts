/**
 * keyFinder React Query hooks — hand-written (not codegen).
 *
 * Deviates from the SKU/RDF codegen pattern because keyFinder's mutation body
 * is `{ field_key, mode }` (not `{ variant_key, variant_id }`) and there's no
 * /loop endpoint yet (Phase 3b). Query keys are prefixed `['key-finder', ...]`
 * so the invalidationResolver auto-invalidates on `key-finder-*` WS events.
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type {
  KeyFinderSummaryRow,
  KeyFinderAllRunsResponse,
  ReservedKeysResponse,
} from '../types.ts';

// ── Reserved keys (long-cached: static across runtime) ────────────────
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

// ── Bundling config (for the BundlingStatusStrip) ─────────────────────
export interface BundlingConfig {
  readonly enabled: boolean;
  readonly alwaysSoloRun: boolean;
  readonly groupBundlingOnly: boolean;
  readonly passengerDifficultyPolicy: string;
  readonly poolPerPrimary: Record<string, number>;
  readonly passengerCost: Record<string, number>;
  readonly variantCount: number;
  readonly overlapCaps: Record<string, number>;
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

// ── Per-product key summary ───────────────────────────────────────────
export function useKeyFinderSummaryQuery(category: string, productId: string) {
  return useQuery<readonly KeyFinderSummaryRow[]>({
    queryKey: ['key-finder', category, productId, 'summary'],
    queryFn: () => api.get<readonly KeyFinderSummaryRow[]>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/summary`,
    ),
    enabled: Boolean(category) && Boolean(productId),
  });
}

// ── All runs for a product (Run History section) ─────────────────────
// GET with no query string hits the default scope='key' branch which returns
// every run when fieldKey is empty (see filterRunsByFieldKey in routes).
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
  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['key-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<{ ok: boolean }, Error, DeleteRunBody>({
    mutationFn: ({ runNumber, fieldKey }) => api.del<{ ok: boolean }>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/runs/${encodeURIComponent(String(runNumber))}?field_key=${encodeURIComponent(fieldKey)}`,
    ),
    onSuccess: invalidate,
  });
}

export function useDeleteAllKeyFinderRunsMutation(category: string, productId: string) {
  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['key-finder', category, productId] });
  }, [queryClient, category, productId]);

  return useMutation<{ ok: boolean }>({
    mutationFn: () => api.del<{ ok: boolean }>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
    ),
    onSuccess: invalidate,
  });
}


