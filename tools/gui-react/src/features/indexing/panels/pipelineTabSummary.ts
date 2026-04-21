import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { FinderTabSummary, FinderTabStatus } from '../../../shared/ui/finder/tabSummary.ts';
import type { ProductHistoryResponse } from '../types.ts';

export function derivePipelineTabSummary(data: ProductHistoryResponse | null): FinderTabSummary {
  const agg = data?.aggregate;
  if (!agg || agg.total_runs === 0) {
    return { kpi: '0 runs', status: 'idle' };
  }
  const successPct = agg.total_urls > 0
    ? Math.round((agg.urls_success / agg.total_urls) * 100)
    : 0;
  const kpi = `${agg.total_runs} runs · ${successPct}%`;
  const status: FinderTabStatus =
    agg.failed_runs === 0 ? 'complete' :
    agg.completed_runs === 0 ? 'empty' :
    'partial';
  return { kpi, status };
}

export function usePipelineTabSummary(productId: string, category: string): FinderTabSummary {
  const { data } = useQuery({
    queryKey: ['indexlab', 'product-history', category, productId],
    queryFn: () => api.get<ProductHistoryResponse>(
      `/indexlab/product-history?category=${encodeURIComponent(category)}&product_id=${encodeURIComponent(productId)}`
    ),
    enabled: Boolean(productId) && Boolean(category) && category !== 'all',
  });
  return derivePipelineTabSummary(data ?? null);
}
