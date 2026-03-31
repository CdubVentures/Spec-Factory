import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { api } from '../../../api/client.ts';
import { DataTable } from '../../../shared/ui/data-display/DataTable.tsx';
import { MetricRow } from '../../../shared/ui/data-display/MetricRow.tsx';
import { TrafficLight } from '../../../shared/ui/feedback/TrafficLight.tsx';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { TabStrip, type TabItem } from '../../../shared/ui/navigation/TabStrip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import type {
  ProductHistoryResponse,
  ProductHistoryRunRow,
  ProductHistoryQueryRow,
  ProductHistoryUrlRow,
  DomainBreakdownRow,
  RunFunnelSummary,
} from '../types.ts';

/* ── Helpers ──────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(startedAt: string, endedAt: string): string {
  if (!startedAt || !endedAt) return '-';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms <= 0) return '-';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

function formatDurationMs(ms: number): string {
  if (!ms || ms <= 0) return '-';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

function formatCost(v: number): string {
  if (!v || isNaN(v)) return '-';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-';
}

function httpStatusColor(status: number): string {
  if (status >= 200 && status < 400) return 'green';
  if (status >= 400 && status < 500) return 'yellow';
  if (status >= 500) return 'red';
  return 'gray';
}

function httpChipClass(status: number): string {
  if (status >= 200 && status < 400) return 'sf-chip-success';
  if (status >= 400 && status < 500) return 'sf-chip-warning';
  if (status >= 500) return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function safetyChipClass(safety: string): string {
  if (safety === 'safe') return 'sf-chip-success';
  if (safety === 'caution') return 'sf-chip-warning';
  if (safety === 'blocked' || safety === 'unsafe') return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function truncateUrl(url: string, max = 55): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 3) + '...';
}

/* ── Tab + chart types ────────────────────────────────────────────── */

type HistoryTab = 'domains' | 'urls' | 'queries';

function buildTabs(run: ProductHistoryRunRow | undefined, urls: ProductHistoryUrlRow[], queries: ProductHistoryQueryRow[]): ReadonlyArray<TabItem<HistoryTab>> {
  const runUrls = run ? urls.filter((u) => u.run_id === run.run_id) : urls;
  const runQueries = run ? queries.filter((q) => q.run_id === run.run_id) : queries;
  return [
    { id: 'domains', label: 'Domains', count: run?.domains.length },
    { id: 'urls', label: 'URLs', count: runUrls.length },
    { id: 'queries', label: 'Queries', count: runQueries.length },
  ];
}

interface RunChartPoint { date: string; completed: number; failed: number }

function buildRunChartData(runs: ProductHistoryRunRow[]): RunChartPoint[] {
  const byDate = new Map<string, { completed: number; failed: number }>();
  for (const r of runs) {
    const date = (r.started_at || '').slice(0, 10);
    if (!date) continue;
    const entry = byDate.get(date) ?? { completed: 0, failed: 0 };
    if (r.status === 'completed') entry.completed += 1;
    else if (r.status === 'failed') entry.failed += 1;
    byDate.set(date, entry);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date: date.slice(5), ...counts }));
}

/* ── Column definitions ───────────────────────────────────────────── */

const domainColumns: ColumnDef<DomainBreakdownRow, unknown>[] = [
  { accessorKey: 'domain', header: 'Domain', cell: ({ row }) => <span className="font-mono sf-text-label">{row.original.domain}</span>, size: 200 },
  { accessorKey: 'role', header: 'Role', cell: ({ row }) => <Chip label={row.original.role} className="sf-chip-accent" />, size: 100 },
  { accessorKey: 'safety', header: 'Safety', cell: ({ row }) => <Chip label={row.original.safety} className={safetyChipClass(row.original.safety)} />, size: 80 },
  { accessorKey: 'urls', header: 'URLs', size: 60 },
  { accessorKey: 'ok', header: 'OK', cell: ({ row }) => <span className={row.original.ok > 0 ? 'sf-status-text-success' : 'sf-text-muted'}>{row.original.ok}</span>, size: 50 },
  { accessorKey: 'errors', header: 'Errors', cell: ({ row }) => <span className={row.original.errors > 0 ? 'sf-status-text-error' : 'sf-text-muted'}>{row.original.errors}</span>, size: 60 },
  { id: 'avg_size', header: 'Avg Size', accessorFn: (row) => row.avg_size, cell: ({ row }) => <span className="font-mono sf-text-label sf-text-muted">{formatBytes(row.original.avg_size)}</span>, size: 80 },
];

const urlColumns: ColumnDef<ProductHistoryUrlRow, unknown>[] = [
  { id: 'status', header: '', accessorFn: (row) => row.http_status, cell: ({ row }) => <TrafficLight color={httpStatusColor(row.original.http_status)} />, size: 32 },
  { accessorKey: 'http_status', header: 'HTTP', cell: ({ row }) => <Chip label={String(row.original.http_status || '?')} className={httpChipClass(row.original.http_status)} />, size: 55 },
  { accessorKey: 'url', header: 'URL', cell: ({ row }) => <span className="font-mono sf-text-label" title={row.original.url}>{truncateUrl(row.original.url)}</span>, size: 320 },
  { accessorKey: 'host', header: 'Host', size: 140 },
  { id: 'tier', header: 'Tier', accessorFn: (row) => row.source_tier, cell: ({ row }) => <Chip label={`T${row.original.source_tier}`} className="sf-chip-neutral" />, size: 50 },
  { accessorKey: 'doc_kind', header: 'Kind', cell: ({ row }) => <Chip label={row.original.doc_kind || '-'} className="sf-chip-neutral" />, size: 65 },
  { id: 'size', header: 'Size', accessorFn: (row) => row.size_bytes, cell: ({ row }) => <span className="font-mono sf-text-label sf-text-muted">{formatBytes(row.original.size_bytes)}</span>, size: 70 },
  { accessorKey: 'crawled_at', header: 'Time', cell: ({ row }) => <span className="sf-text-muted">{relativeTime(row.original.crawled_at)}</span>, size: 70 },
];

const queryColumns: ColumnDef<ProductHistoryQueryRow, unknown>[] = [
  { accessorKey: 'query', header: 'Query', size: 380 },
  { accessorKey: 'provider', header: 'Provider', cell: ({ row }) => <Chip label={row.original.provider} className="sf-chip-accent" />, size: 80 },
  { accessorKey: 'result_count', header: 'Results', size: 65 },
  { accessorKey: 'ts', header: 'Time', cell: ({ row }) => <span className="sf-text-muted">{relativeTime(row.original.ts)}</span>, size: 80 },
];

/* ── Chart constants ──────────────────────────────────────────────── */

const CHART_GREEN = '#86efac';
const CHART_RED = '#f87171';
const CHART_TOOLTIP_BG = '#111f41';
const CHART_MUTED = '#adc2eb';

/* ── Funnel Step Component ────────────────────────────────────────── */

interface FunnelStepProps {
  count: number;
  label: string;
  subtitle?: string;
  color: string;
  isLast?: boolean;
  extra?: React.ReactNode;
}

function FunnelStep({ count, label, subtitle, color, isLast, extra }: FunnelStepProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center relative px-1 py-3">
      <div className="absolute inset-0 rounded opacity-[0.06]" style={{ background: color }} />
      <span className="relative text-xl font-bold tabular-nums" style={{ color }}>{count}</span>
      <span className="relative sf-text-caption sf-text-muted uppercase tracking-wide mt-0.5">{label}</span>
      {subtitle && <span className="relative sf-text-micro sf-text-subtle mt-0.5">{subtitle}</span>}
      {extra && <div className="relative flex gap-1 mt-1">{extra}</div>}
      {!isLast && (
        <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 sf-text-subtle text-base z-10">&rarr;</span>
      )}
    </div>
  );
}

/* ── Pipeline Funnel ──────────────────────────────────────────────── */

function PipelineFunnel({ funnel }: { funnel: RunFunnelSummary }) {
  const f = funnel;
  return (
    <div className="flex gap-0 sf-surface-elevated rounded p-2">
      <FunnelStep count={f.queries_executed} label="Queries" color="#818cf8" />
      <FunnelStep count={f.results_found} label="Results" subtitle={f.queries_executed > 0 ? `${Math.round(f.results_found / f.queries_executed)}/q avg` : ''} color="#93c5fd" />
      <FunnelStep count={f.candidates_triaged} label="Triaged" subtitle={f.results_found > 0 ? pct(f.candidates_triaged, f.results_found) : ''} color="#fcd34d" />
      <FunnelStep count={f.urls_selected} label="Selected" subtitle={f.candidates_triaged > 0 ? pct(f.urls_selected, f.candidates_triaged) : ''} color="#818cf8" />
      <FunnelStep
        count={f.urls_ok}
        label="Fetched OK"
        color="#86efac"
        extra={
          <>
            {f.urls_blocked > 0 && <span className="sf-chip-danger sf-text-micro px-1 py-0 rounded">{f.urls_blocked} blocked</span>}
            {f.urls_error > 0 && <span className="sf-chip-warning sf-text-micro px-1 py-0 rounded">{f.urls_error} error</span>}
          </>
        }
      />
      <FunnelStep count={f.docs_parsed} label="Parsed" subtitle={f.urls_ok > 0 ? pct(f.docs_parsed, f.urls_ok + f.urls_blocked + f.urls_error) : ''} color="#86efac" isLast />
    </div>
  );
}

/* ── Empty fallback metrics ───────────────────────────────────────── */

const EMPTY_AGG: ProductHistoryResponse['aggregate'] = {
  total_runs: 0, completed_runs: 0, failed_runs: 0,
  total_cost_usd: 0, avg_cost_per_run: 0, avg_duration_ms: 0,
  total_queries: 0, total_urls: 0, urls_success: 0, urls_failed: 0, unique_hosts: 0,
};

/* ── Main Component ───────────────────────────────────────────────── */

interface ProductHistoryPanelProps {
  productId: string;
  category: string;
}

export function ProductHistoryPanel({ productId, category }: ProductHistoryPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<HistoryTab>('domains');
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['indexlab', 'product-history', category, productId],
    queryFn: () => api.get<ProductHistoryResponse>(
      `/indexlab/product-history?category=${encodeURIComponent(category)}&product_id=${encodeURIComponent(productId)}`
    ),
    enabled: Boolean(productId) && Boolean(category) && category !== 'all',
    refetchInterval: 10_000,
  });

  const selectedRun = useMemo(() => {
    if (!data?.runs.length) return undefined;
    const target = selectedRunId || data.runs[0]?.run_id;
    return data.runs.find((r) => r.run_id === target) ?? data.runs[0];
  }, [data?.runs, selectedRunId]);

  const runChartData = useMemo(() => buildRunChartData(data?.runs ?? []), [data?.runs]);

  const tabs = useMemo(
    () => buildTabs(selectedRun, data?.urls ?? [], data?.queries ?? []),
    [selectedRun, data?.urls, data?.queries],
  );

  const filteredUrls = useMemo(
    () => selectedRun ? (data?.urls ?? []).filter((u) => u.run_id === selectedRun.run_id) : (data?.urls ?? []),
    [selectedRun, data?.urls],
  );

  const filteredQueries = useMemo(
    () => selectedRun ? (data?.queries ?? []).filter((q) => q.run_id === selectedRun.run_id) : (data?.queries ?? []),
    [selectedRun, data?.queries],
  );

  const agg = data?.aggregate ?? EMPTY_AGG;

  const metrics = useMemo(() => {
    if (!data) return [];
    const a = data.aggregate;
    return [
      { label: 'Total Runs', value: a.total_runs },
      { label: 'Success Rate', value: pct(a.completed_runs, a.total_runs), deltaColor: 'green' as const },
      { label: 'Total Cost', value: formatCost(a.total_cost_usd), delta: `avg ${formatCost(a.avg_cost_per_run)}/run` },
      { label: 'Avg Duration', value: formatDurationMs(a.avg_duration_ms) },
      { label: 'URLs Crawled', value: a.total_urls },
      { label: 'Crawl Success', value: pct(a.urls_success, a.total_urls), delta: `${a.urls_success} of ${a.total_urls}`, deltaColor: 'green' as const },
      { label: 'Queries', value: a.total_queries },
      { label: 'Unique Hosts', value: a.unique_hosts },
    ];
  }, [data]);

  if (!productId || category === 'all') return null;

  return (
    <div className="sf-surface-panel p-3 space-y-3 order-[-10]">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
          title={collapsed ? 'Open panel' : 'Close panel'}
        >
          {collapsed ? '+' : '-'}
        </button>
        <span className="text-sm font-semibold sf-text-primary">Run History</span>
        <span className="sf-text-caption sf-text-muted font-mono">{productId}</span>
        <Tip text="Pipeline history: searches, triage, crawl, parse across all runs for this product." />
      </div>

      {collapsed ? null : isLoading ? (
        <div className="flex items-center justify-center py-8"><Spinner /></div>
      ) : !data || data.runs.length === 0 ? (
        <div className="text-center py-8 sf-text-muted sf-text-body-sm">
          <p>No run history for this product yet.</p>
          <p className="sf-text-caption mt-1">Run IndexLab above to start building history.</p>
        </div>
      ) : (
        <>
          {/* Aggregate Metrics */}
          <MetricRow metrics={metrics} />

          {/* Runs Over Time chart (only when > 1 run) */}
          {runChartData.length > 1 && (
            <div className="sf-surface-elevated p-3 rounded">
              <p className="sf-text-label font-semibold sf-text-muted mb-2">Runs Over Time</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={runChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: CHART_MUTED }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART_MUTED }} width={20} />
                  <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: 'none', fontSize: 12 }} labelStyle={{ color: CHART_MUTED }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="completed" stackId="a" fill={CHART_GREEN} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="failed" stackId="a" fill={CHART_RED} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Run Selector */}
          <div>
            <p className="sf-text-caption sf-text-muted uppercase tracking-wide font-semibold mb-1.5">Select Run</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.runs.map((run) => (
                <button
                  key={run.run_id}
                  onClick={() => setSelectedRunId(run.run_id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded sf-text-label whitespace-nowrap transition-all ${
                    selectedRun?.run_id === run.run_id
                      ? 'sf-surface-elevated border sf-border-accent'
                      : 'sf-surface-elevated border sf-border-soft hover:sf-border-accent'
                  }`}
                >
                  <TrafficLight color={run.status === 'completed' ? 'green' : run.status === 'failed' ? 'red' : 'gray'} />
                  <span className="font-mono">{run.run_id.slice(0, 15)}</span>
                  <span className="sf-text-muted">{relativeTime(run.started_at)}</span>
                  <span className="font-mono sf-status-text-warning">{formatCost(run.cost_usd)}</span>
                  <span className="sf-text-muted">{formatDuration(run.started_at, run.ended_at)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline Funnel for selected run */}
          {selectedRun && (
            <div>
              <p className="sf-text-caption sf-text-muted uppercase tracking-wide font-semibold mb-1.5">
                Pipeline Funnel — {selectedRun.run_id.slice(0, 15)}
              </p>
              <PipelineFunnel funnel={selectedRun.funnel} />
            </div>
          )}

          {/* Tabs */}
          <TabStrip tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

          {activeTab === 'domains' && selectedRun && (
            <DataTable data={selectedRun.domains} columns={domainColumns} persistKey="product-history-domains" maxHeight="max-h-[350px]" />
          )}
          {activeTab === 'urls' && (
            <DataTable data={filteredUrls} columns={urlColumns} searchable persistKey="product-history-urls" maxHeight="max-h-[350px]" />
          )}
          {activeTab === 'queries' && (
            <DataTable data={filteredQueries} columns={queryColumns} searchable persistKey="product-history-queries" maxHeight="max-h-[350px]" />
          )}
        </>
      )}
    </div>
  );
}
