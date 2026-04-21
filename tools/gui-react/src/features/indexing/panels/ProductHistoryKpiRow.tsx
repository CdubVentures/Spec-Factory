/**
 * ProductHistoryKpiRow — the 6-card KPI strip for a product's run history.
 * Extracted out of ProductHistoryPanel so PipelinePanel can render it
 * directly above the (collapsible) Run History. Same useQuery key as
 * ProductHistoryPanel → cache is shared, no extra network.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { Sparkline } from '../../runtime-ops/components/Sparkline.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { parseBackendMs } from '../../../utils/dateTime.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import type { ProductHistoryResponse, ProductHistoryRunRow } from '../types.ts';

function fmtDurMs(ms: number): string {
  if (!ms) return '-';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtCost(v: number): string {
  if (!v) return '-';
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

function fmtBytes(b: number): string {
  if (!b) return '-';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-';
}

const EMPTY_AGG: ProductHistoryResponse['aggregate'] = {
  total_runs: 0, completed_runs: 0, failed_runs: 0,
  total_cost_usd: 0, avg_cost_per_run: 0, avg_duration_ms: 0,
  total_queries: 0, total_urls: 0, urls_success: 0, urls_failed: 0, unique_hosts: 0,
};

function KpiCard({ value, label, delta, deltaType, sparkData, sparkColor }: {
  value: string | number; label: string; delta?: string;
  deltaType?: 'up' | 'down' | 'flat'; sparkData?: number[]; sparkColor?: string;
}) {
  return (
    <div className="sf-surface-elevated rounded-lg p-5 flex flex-col gap-1">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[32px] font-bold leading-none tracking-tight">{value}</div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] sf-text-muted">{label}</div>
        </div>
        {sparkData && sparkData.length >= 2 && (
          <Sparkline values={sparkData} width={80} height={32} className={sparkColor ? `text-[${sparkColor}]` : ''} />
        )}
      </div>
      {delta && (
        <span className={`inline-flex items-center self-start gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 ${
          deltaType === 'up' ? 'sf-callout-success' : deltaType === 'down' ? 'sf-callout-danger' : 'sf-text-muted'
        }`}>
          {deltaType === 'up' ? '↑' : deltaType === 'down' ? '↓' : '—'} {delta}
        </span>
      )}
    </div>
  );
}

export interface ProductHistoryKpiRowProps { productId: string; category: string }

export function ProductHistoryKpiRow({ productId, category }: ProductHistoryKpiRowProps) {
  const [selRunId] = usePersistedTab<string>(`indexing:history:run:${productId}`, '');

  const { data, isLoading } = useQuery({
    queryKey: ['indexlab', 'product-history', category, productId],
    queryFn: () => api.get<ProductHistoryResponse>(
      `/indexlab/product-history?category=${encodeURIComponent(category)}&product_id=${encodeURIComponent(productId)}`
    ),
    enabled: Boolean(productId) && Boolean(category) && category !== 'all',
  });

  const selRun: ProductHistoryRunRow | undefined = useMemo(() => {
    if (!data?.runs.length) return undefined;
    return data.runs.find((r) => r.run_id === (selRunId || data.runs[0]?.run_id)) ?? data.runs[0];
  }, [data?.runs, selRunId]);

  const sparkRuns = useMemo(() => (data?.runs ?? []).map(() => 1), [data?.runs]);
  const sparkCosts = useMemo(() => (data?.runs ?? []).map((r) => r.cost_usd), [data?.runs]);
  const sparkSuccess = useMemo(() => (data?.runs ?? []).map((r) => {
    const total = r.funnel.urls_ok + r.funnel.urls_blocked + r.funnel.urls_error;
    return total > 0 ? r.funnel.urls_ok / total : 0;
  }), [data?.runs]);
  const sparkDuration = useMemo(() => (data?.runs ?? []).map((r) => {
    if (!r.started_at || !r.ended_at) return 0;
    return parseBackendMs(r.ended_at) - parseBackendMs(r.started_at);
  }), [data?.runs]);

  if (!productId) return null;
  if (isLoading) return (
    <div className="flex items-center justify-center py-6"><Spinner /></div>
  );

  const agg = data?.aggregate ?? EMPTY_AGG;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <KpiCard
        value={agg.total_runs}
        label="Total Runs"
        delta={`${pct(agg.completed_runs, agg.total_runs)} success`}
        deltaType={agg.completed_runs === agg.total_runs ? 'up' : agg.failed_runs > 0 ? 'down' : 'flat'}
        sparkData={sparkRuns}
      />
      <KpiCard
        value={fmtCost(agg.total_cost_usd)}
        label="Total Cost"
        delta={`avg ${fmtCost(agg.avg_cost_per_run)}/run`}
        deltaType="flat"
        sparkData={sparkCosts}
      />
      <KpiCard
        value={pct(agg.urls_success, agg.total_urls)}
        label="Crawl Success"
        delta={`${agg.urls_success} of ${agg.total_urls} URLs`}
        deltaType={agg.urls_success === agg.total_urls ? 'up' : 'down'}
        sparkData={sparkSuccess}
      />
      <KpiCard
        value={fmtDurMs(agg.avg_duration_ms)}
        label="Avg Duration"
        deltaType="flat"
        sparkData={sparkDuration}
      />
      <KpiCard
        value={selRun?.extraction.total_artifacts ?? 0}
        label="Artifacts"
        delta={selRun ? Object.keys(selRun.extraction.plugins).join(', ') : ''}
        deltaType="flat"
      />
      <KpiCard
        value={fmtBytes(selRun?.extraction.total_bytes ?? 0)}
        label="Data Captured"
        delta={`${selRun?.extraction.urls_parsed ?? 0} pages parsed`}
        deltaType="flat"
      />
    </div>
  );
}
