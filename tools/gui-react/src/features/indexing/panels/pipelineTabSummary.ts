import type { FinderTabSummary, FinderTabStatus } from '../../../shared/ui/finder/tabSummary.ts';
import type { ProductHistoryResponse } from '../types.ts';
import { useProductHistoryQuery } from '../api/productHistoryQuery.ts';

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
  if (agg.total_urls === 0) {
    return { kpi, status };
  }
  return {
    kpi,
    status,
    numerator: agg.urls_success,
    denominator: agg.total_urls,
    percent: successPct,
  };
}

export function usePipelineTabSummary(productId: string, category: string): FinderTabSummary {
  const { data } = useProductHistoryQuery(category, productId);
  return derivePipelineTabSummary(data ?? null);
}
