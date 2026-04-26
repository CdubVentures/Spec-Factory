import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { ProductHistoryResponse } from '../types.ts';

// WHY: Three Indexing-pane consumers (ProductHistoryPanel,
// ProductHistoryKpiRow, pipelineTabSummary) all open the same
// product-history query. Centralizing the key + URL + options here keeps
// them in lockstep — any future option drift (staleTime, gcTime,
// transforms) flows from one place. React Query already dedupes the
// network call by key; the hook just deduplicates the *declaration*.
//
// staleTime 30s: history rarely changes mid-session. Phase 2's narrowed
// invalidation (refreshIndexingPageData scoped to category+productId)
// keeps the cache fresh after a run completes.
export function useProductHistoryQuery(
  category: string,
  productId: string,
): UseQueryResult<ProductHistoryResponse> {
  return useQuery<ProductHistoryResponse>({
    queryKey: ['indexlab', 'product-history', category, productId],
    queryFn: () => api.get<ProductHistoryResponse>(
      `/indexlab/product-history?category=${encodeURIComponent(category)}&product_id=${encodeURIComponent(productId)}`,
    ),
    enabled: Boolean(productId) && Boolean(category) && category !== 'all',
    staleTime: 30_000,
  });
}
