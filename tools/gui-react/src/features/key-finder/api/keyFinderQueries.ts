/**
 * keyFinder React Query hooks — hand-written (not codegen).
 *
 * Deviates from the SKU/RDF codegen pattern because keyFinder's mutation body
 * is `{ field_key, mode }` (not `{ variant_key, variant_id }`) and there's no
 * /loop endpoint yet (Phase 3b). Query keys are prefixed `['key-finder', ...]`
 * so the invalidationResolver auto-invalidates on `key-finder-*` WS events.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type {
  KeyFinderSummaryRow,
  KeyFinderDetail,
  ReservedKeysResponse,
  KeyHistoryScope,
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

// ── History (scope-parameterized: key / group / product) ──────────────
interface HistoryArgs {
  readonly category: string;
  readonly productId: string;
  readonly scope: KeyHistoryScope;
  /** field_key for scope=key; group name for scope=group; ignored for product */
  readonly id?: string;
  readonly enabled?: boolean;
}

export function useKeyFinderHistoryQuery({ category, productId, scope, id, enabled = true }: HistoryArgs) {
  const params = new URLSearchParams();
  params.set('scope', scope);
  if (scope === 'key' && id) params.set('field_key', id);
  if (scope === 'group' && id) params.set('group', id);
  const qs = params.toString();
  return useQuery<KeyFinderDetail>({
    queryKey: ['key-finder', category, productId, 'history', scope, id ?? ''],
    queryFn: () => api.get<KeyFinderDetail>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}?${qs}`,
    ),
    enabled: enabled && Boolean(category) && Boolean(productId)
      && (scope === 'product' || Boolean(id)),
  });
}

// ── Prompt data (reuses key-scope detail to get the one run's prompt) ─
export function useKeyFinderPromptQuery({
  category, productId, fieldKey, enabled = true,
}: { category: string; productId: string; fieldKey: string; enabled?: boolean }) {
  return useQuery<KeyFinderDetail>({
    queryKey: ['key-finder', category, productId, 'prompt', fieldKey],
    queryFn: () => api.get<KeyFinderDetail>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}?field_key=${encodeURIComponent(fieldKey)}`,
    ),
    enabled: enabled && Boolean(category) && Boolean(productId) && Boolean(fieldKey),
  });
}
