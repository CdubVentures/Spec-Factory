import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts';
import { api } from '../../../api/client.ts';
import { DataTable } from '../../../shared/ui/data-display/DataTable.tsx';
import { MetricRow } from '../../../shared/ui/data-display/MetricRow.tsx';
import { TrafficLight } from '../../../shared/ui/feedback/TrafficLight.tsx';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { TabStrip, type TabItem } from '../../../shared/ui/navigation/TabStrip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { ProgressBar } from '../../../shared/ui/data-display/ProgressBar.tsx';
import type {
  ProductHistoryResponse,
  ProductHistoryRunRow,
  ProductHistoryQueryRow,
  ProductHistoryUrlRow,
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

function runStatusColor(status: string): string {
  if (status === 'completed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'running') return 'teal';
  return 'gray';
}

function httpStatusColor(status: number): string {
  if (status >= 200 && status < 400) return 'green';
  if (status >= 400 && status < 500) return 'yellow';
  if (status >= 500) return 'red';
  return 'gray';
}

function httpStatusChipClass(status: number): string {
  if (status >= 200 && status < 400) return 'sf-chip-success';
  if (status >= 400 && status < 500) return 'sf-chip-warning';
  if (status >= 500) return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function tierLabel(tier: number): string {
  return tier > 0 && tier <= 5 ? `T${tier}` : `T${tier}`;
}

function tierChipClass(tier: number): string {
  if (tier === 1) return 'sf-chip-success';
  if (tier <= 3) return 'sf-chip-accent';
  return 'sf-chip-neutral';
}

function truncateUrl(url: string, max = 55): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 3) + '...';
}

/* ── Tab definitions ──────────────────────────────────────────────── */

type HistoryTab = 'runs' | 'queries' | 'urls';

function buildTabs(data: ProductHistoryResponse | undefined): ReadonlyArray<TabItem<HistoryTab>> {
  return [
    { id: 'runs', label: 'Runs', count: data?.runs.length },
    { id: 'queries', label: 'Queries', count: data?.queries.length },
    { id: 'urls', label: 'URLs', count: data?.urls.length },
  ] as const;
}

/* ── Chart data builders ──────────────────────────────────────────── */

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

interface UrlDonutSlice { name: string; value: number; color: string }

function buildUrlDonutData(metrics: ProductHistoryResponse['metrics']): UrlDonutSlice[] {
  return [
    { name: 'Crawled OK', value: metrics.urls_success, color: '#86efac' },
    { name: 'Errored', value: metrics.urls_failed, color: '#f87171' },
  ];
}

interface TierBreakdown { tier: string; total: number; success: number; rate: number }

function buildTierBreakdown(urls: ProductHistoryUrlRow[]): TierBreakdown[] {
  const byTier = new Map<string, { total: number; success: number }>();
  for (const u of urls) {
    const tier = tierLabel(u.source_tier);
    const entry = byTier.get(tier) ?? { total: 0, success: 0 };
    entry.total += 1;
    if (u.http_status >= 200 && u.http_status < 400) entry.success += 1;
    byTier.set(tier, entry);
  }
  return [...byTier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tier, { total, success }]) => ({
      tier, total, success,
      rate: total > 0 ? success / total : 0,
    }));
}

/* ── Column definitions ───────────────────────────────────────────── */

const runsColumns: ColumnDef<ProductHistoryRunRow, unknown>[] = [
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <TrafficLight color={runStatusColor(row.original.status)} />,
    size: 60,
  },
  {
    accessorKey: 'run_id',
    header: 'Run ID',
    cell: ({ row }) => <span className="font-mono sf-text-label">{row.original.run_id}</span>,
    size: 180,
  },
  {
    id: 'started',
    header: 'Started',
    accessorFn: (row) => row.started_at || '',
    cell: ({ row }) => <span className="sf-text-muted">{relativeTime(row.original.started_at)}</span>,
    size: 100,
  },
  {
    id: 'duration',
    header: 'Duration',
    accessorFn: (row) => {
      if (!row.started_at || !row.ended_at) return 0;
      return new Date(row.ended_at).getTime() - new Date(row.started_at).getTime();
    },
    cell: ({ row }) => <span className="font-mono sf-text-label">{formatDuration(row.original.started_at, row.original.ended_at)}</span>,
    size: 90,
  },
  {
    accessorKey: 'cost_usd',
    header: 'Cost',
    cell: ({ row }) => (
      <span className="font-mono sf-text-label sf-status-text-warning">
        {formatCost(row.original.cost_usd)}
      </span>
    ),
    size: 80,
  },
  {
    id: 'fetched_ok',
    header: 'Fetched OK',
    accessorFn: (row) => row.counters?.fetched_ok ?? 0,
    cell: ({ row }) => {
      const ok = row.original.counters?.fetched_ok;
      return ok != null ? <span className="sf-status-text-success">{ok}</span> : <span className="sf-text-muted">-</span>;
    },
    size: 80,
  },
  {
    id: 'fetch_errors',
    header: 'Errors',
    accessorFn: (row) => row.counters?.fetched_error ?? 0,
    cell: ({ row }) => {
      const err = row.original.counters?.fetched_error;
      return err ? <span className="sf-status-text-error">{err}</span> : <span className="sf-text-muted">0</span>;
    },
    size: 60,
  },
];

const queriesColumns: ColumnDef<ProductHistoryQueryRow, unknown>[] = [
  {
    accessorKey: 'query',
    header: 'Query',
    size: 350,
  },
  {
    accessorKey: 'provider',
    header: 'Provider',
    cell: ({ row }) => <Chip label={row.original.provider} className="sf-chip-accent" />,
    size: 90,
  },
  {
    accessorKey: 'result_count',
    header: 'Results',
    size: 70,
  },
  {
    accessorKey: 'run_id',
    header: 'Run',
    cell: ({ row }) => <span className="font-mono sf-text-label sf-text-muted">{row.original.run_id}</span>,
    size: 160,
  },
  {
    accessorKey: 'ts',
    header: 'Time',
    cell: ({ row }) => <span className="sf-text-muted">{relativeTime(row.original.ts)}</span>,
    size: 90,
  },
];

const urlsColumns: ColumnDef<ProductHistoryUrlRow, unknown>[] = [
  {
    id: 'crawl_status',
    header: 'Status',
    accessorFn: (row) => row.http_status,
    cell: ({ row }) => <TrafficLight color={httpStatusColor(row.original.http_status)} />,
    size: 50,
  },
  {
    accessorKey: 'http_status',
    header: 'HTTP',
    cell: ({ row }) => (
      <Chip
        label={String(row.original.http_status || '?')}
        className={httpStatusChipClass(row.original.http_status)}
      />
    ),
    size: 60,
  },
  {
    accessorKey: 'url',
    header: 'URL',
    cell: ({ row }) => (
      <span className="font-mono sf-text-label" title={row.original.url}>
        {truncateUrl(row.original.url)}
      </span>
    ),
    size: 320,
  },
  {
    accessorKey: 'host',
    header: 'Host',
    size: 140,
  },
  {
    id: 'tier',
    header: 'Tier',
    accessorFn: (row) => row.source_tier,
    cell: ({ row }) => <Chip label={tierLabel(row.original.source_tier)} className={tierChipClass(row.original.source_tier)} />,
    size: 55,
  },
  {
    accessorKey: 'doc_kind',
    header: 'Kind',
    cell: ({ row }) => <Chip label={row.original.doc_kind || '-'} className="sf-chip-neutral" />,
    size: 70,
  },
  {
    id: 'size',
    header: 'Size',
    accessorFn: (row) => row.size_bytes,
    cell: ({ row }) => <span className="font-mono sf-text-label sf-text-muted">{formatBytes(row.original.size_bytes)}</span>,
    size: 70,
  },
  {
    accessorKey: 'run_id',
    header: 'Run',
    cell: ({ row }) => <span className="font-mono sf-text-label sf-text-muted">{row.original.run_id}</span>,
    size: 140,
  },
  {
    accessorKey: 'crawled_at',
    header: 'Time',
    cell: ({ row }) => <span className="sf-text-muted">{relativeTime(row.original.crawled_at)}</span>,
    size: 80,
  },
];

/* ── Chart colors (design-system aligned) ─────────────────────────── */

const CHART_GREEN = '#86efac';
const CHART_RED = '#f87171';
const CHART_TOOLTIP_BG = '#111f41';
const CHART_TEXT_MUTED = '#adc2eb';

/* ── Fallback metrics (avoids null-checking in useMemo) ───────────── */

const EMPTY_METRICS: ProductHistoryResponse['metrics'] = {
  total_runs: 0, completed_runs: 0, failed_runs: 0,
  total_cost_usd: 0, avg_cost_per_run: 0, total_queries: 0,
  unique_queries: 0, total_urls: 0, urls_success: 0, urls_failed: 0, unique_hosts: 0,
};

/* ── Main Component ───────────────────────────────────────────────── */

interface ProductHistoryPanelProps {
  productId: string;
  category: string;
}

export function ProductHistoryPanel({ productId, category }: ProductHistoryPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<HistoryTab>('runs');

  const { data, isLoading } = useQuery({
    queryKey: ['indexlab', 'product-history', category, productId],
    queryFn: () => api.get<ProductHistoryResponse>(
      `/indexlab/product-history?category=${encodeURIComponent(category)}&product_id=${encodeURIComponent(productId)}`
    ),
    enabled: Boolean(productId) && Boolean(category) && category !== 'all',
    refetchInterval: 10_000,
  });

  const tabs = useMemo(() => buildTabs(data), [data]);
  const runChartData = useMemo(() => buildRunChartData(data?.runs ?? []), [data?.runs]);
  const urlDonutData = useMemo(() => buildUrlDonutData(data?.metrics ?? EMPTY_METRICS), [data?.metrics]);
  const tierBreakdown = useMemo(() => buildTierBreakdown(data?.urls ?? []), [data?.urls]);

  const metrics = useMemo(() => {
    const m = data?.metrics;
    if (!m) return [];
    const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '-';
    return [
      { label: 'Total Runs', value: m.total_runs },
      { label: 'Completed', value: m.completed_runs, delta: pct(m.completed_runs, m.total_runs), deltaColor: 'green' as const },
      { label: 'Failed', value: m.failed_runs, delta: pct(m.failed_runs, m.total_runs), deltaColor: 'red' as const },
      { label: 'Total Cost', value: formatCost(m.total_cost_usd), delta: `avg ${formatCost(m.avg_cost_per_run)}/run` },
      { label: 'URLs Crawled', value: m.total_urls },
      { label: 'Crawl Success', value: m.urls_success, delta: pct(m.urls_success, m.total_urls), deltaColor: 'green' as const },
      { label: 'Queries Fired', value: m.total_queries },
      { label: 'Unique Hosts', value: m.unique_hosts },
    ];
  }, [data?.metrics]);

  if (!productId || category === 'all') return null;

  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: -10 }}>
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
        <Tip text="Crawl and extraction history across all runs for this product. Data from crawl_sources + billing_entries." />
      </div>

      {collapsed ? null : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner />
        </div>
      ) : !data || data.runs.length === 0 ? (
        <div className="text-center py-8 sf-text-muted sf-text-body-sm">
          <p>No run history for this product yet.</p>
          <p className="sf-text-caption mt-1">Run IndexLab above to start building history.</p>
        </div>
      ) : (
        <>
          <MetricRow metrics={metrics} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="sf-surface-elevated p-3 rounded">
              <p className="sf-text-label font-semibold sf-text-muted mb-2">Runs Over Time</p>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={runChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: CHART_TEXT_MUTED }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: CHART_TEXT_MUTED }} width={24} />
                  <Tooltip
                    contentStyle={{ background: CHART_TOOLTIP_BG, border: 'none', fontSize: 12 }}
                    labelStyle={{ color: CHART_TEXT_MUTED }}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="completed" stackId="a" fill={CHART_GREEN} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="failed" stackId="a" fill={CHART_RED} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="sf-surface-elevated p-3 rounded">
              <p className="sf-text-label font-semibold sf-text-muted mb-2">URL Crawl Results</p>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie
                      data={urlDonutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {urlDonutData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: CHART_TOOLTIP_BG, border: 'none', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 sf-text-label">
                  {urlDonutData.map((d) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                      <span>{d.name}</span>
                      <span className="sf-text-muted">({d.value})</span>
                    </div>
                  ))}
                  {tierBreakdown.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="sf-text-caption sf-text-muted uppercase tracking-wide font-semibold">Success by Tier</p>
                      {tierBreakdown.map((t) => (
                        <ProgressBar
                          key={t.tier}
                          value={t.rate}
                          label={t.tier}
                          color={t.rate >= 0.8 ? 'bg-green-500' : t.rate >= 0.5 ? 'bg-yellow-400' : 'bg-red-500'}
                          height="h-1.5"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <TabStrip tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

          {activeTab === 'runs' && (
            <DataTable data={data.runs} columns={runsColumns} persistKey="product-history-runs" maxHeight="max-h-[400px]" />
          )}
          {activeTab === 'queries' && (
            <DataTable data={data.queries} columns={queriesColumns} searchable persistKey="product-history-queries" maxHeight="max-h-[400px]" />
          )}
          {activeTab === 'urls' && (
            <DataTable data={data.urls} columns={urlsColumns} searchable persistKey="product-history-urls" maxHeight="max-h-[400px]" />
          )}
        </>
      )}
    </div>
  );
}
