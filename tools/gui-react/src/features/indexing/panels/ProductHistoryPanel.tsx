import { Fragment, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../../api/client.ts';
import { DataTable } from '../../../shared/ui/data-display/DataTable.tsx';
import { TrafficLight } from '../../../shared/ui/feedback/TrafficLight.tsx';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { TabStrip, type TabItem } from '../../../shared/ui/navigation/TabStrip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { Sparkline } from '../../runtime-ops/components/Sparkline.tsx';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import type {
  ProductHistoryResponse,
  ProductHistoryRunRow,
  ProductHistoryQueryRow,
  ProductHistoryUrlRow,
  DomainBreakdownRow,
  FetchErrorRow,
  RunFunnelSummary,
  ExtractionSummary,
} from '../types.ts';

/* ── Helpers ──────────────────────────────────────────────────────── */

function relTime(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDur(a: string, b: string): string {
  if (!a || !b) return '-';
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (ms <= 0) return '-';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

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

function httpColor(s: number): string {
  if (s >= 200 && s < 400) return 'green';
  if (s >= 400 && s < 500) return 'yellow';
  return s >= 500 ? 'red' : 'gray';
}

function httpChip(s: number): string {
  if (s >= 200 && s < 400) return 'sf-chip-success';
  if (s >= 400 && s < 500) return 'sf-chip-warning';
  return s >= 500 ? 'sf-chip-danger' : 'sf-chip-neutral';
}

function safetyChip(s: string): string {
  if (s === 'safe') return 'sf-chip-success';
  if (s === 'caution') return 'sf-chip-warning';
  if (s === 'blocked') return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function trunc(url: string, max = 50): string {
  return url.length <= max ? url : url.slice(0, max - 3) + '...';
}

/* ── Tab + chart types ────────────────────────────────────────────── */

type HistTab = 'queries' | 'domains' | 'urls' | 'errors';
const HIST_TAB_KEYS: readonly HistTab[] = ['queries', 'domains', 'urls', 'errors'] as const;

function buildTabs(run: ProductHistoryRunRow | undefined, urls: ProductHistoryUrlRow[], queries: ProductHistoryQueryRow[]): ReadonlyArray<TabItem<HistTab>> {
  const rUrls = run ? urls.filter((u) => u.run_id === run.run_id) : urls;
  const rQueries = run ? queries.filter((q) => q.run_id === run.run_id) : queries;
  return [
    { id: 'queries', label: 'Queries', count: rQueries.length },
    { id: 'domains', label: 'Domains', count: run?.domains.length },
    { id: 'urls', label: 'URLs', count: rUrls.length },
    { id: 'errors', label: 'Errors', count: run?.errors.length ?? 0 },
  ];
}

/* ── Column defs ──────────────────────────────────────────────────── */

function tierChip(tier: string | null): { label: string; cls: string } {
  if (tier === 'seed') return { label: 'T1', cls: 'sf-chip-danger' };
  if (tier === 'group_search') return { label: 'T2', cls: 'sf-chip-info' };
  if (tier === 'key_search') return { label: 'T3', cls: 'sf-chip-success' };
  return { label: '-', cls: 'sf-chip-neutral' };
}

const queryColumns: ColumnDef<ProductHistoryQueryRow, unknown>[] = [
  { accessorKey: 'query', header: 'Query', size: 340 },
  { id: 'tier', header: 'Tier', accessorFn: (r) => r.tier, cell: ({ row }) => { const t = tierChip(row.original.tier); return <Chip label={t.label} className={t.cls} />; }, size: 50 },
  { accessorKey: 'provider', header: 'Provider', cell: ({ row }) => <Chip label={row.original.provider} className="sf-chip-accent" />, size: 80 },
  { accessorKey: 'result_count', header: 'Results', size: 65 },
  { accessorKey: 'ts', header: 'Time', cell: ({ row }) => <span className="sf-text-muted">{relTime(row.original.ts)}</span>, size: 80 },
];

const domainColumns: ColumnDef<DomainBreakdownRow, unknown>[] = [
  { accessorKey: 'domain', header: 'Domain', cell: ({ row }) => <span className="font-mono sf-text-label">{row.original.domain}</span>, size: 200 },
  { accessorKey: 'role', header: 'Role', cell: ({ row }) => <Chip label={row.original.role} className="sf-chip-accent" />, size: 100 },
  { accessorKey: 'safety', header: 'Safety', cell: ({ row }) => <Chip label={row.original.safety} className={safetyChip(row.original.safety)} />, size: 80 },
  { accessorKey: 'urls', header: 'URLs', size: 55 },
  { accessorKey: 'ok', header: 'OK', cell: ({ row }) => <span className={row.original.ok > 0 ? 'sf-status-text-success' : 'sf-text-muted'}>{row.original.ok}</span>, size: 50 },
  { accessorKey: 'errors', header: 'Errors', cell: ({ row }) => <span className={row.original.errors > 0 ? 'sf-status-text-danger' : 'sf-text-muted'}>{row.original.errors}</span>, size: 55 },
  { id: 'avg_size', header: 'Avg Size', accessorFn: (r) => r.avg_size, cell: ({ row }) => <span className="font-mono sf-text-label sf-text-muted">{fmtBytes(row.original.avg_size)}</span>, size: 80 },
];

const urlColumns: ColumnDef<ProductHistoryUrlRow, unknown>[] = [
  { id: 's', header: '', accessorFn: (r) => r.http_status, cell: ({ row }) => <TrafficLight color={httpColor(row.original.http_status)} />, size: 28 },
  { accessorKey: 'http_status', header: 'HTTP', cell: ({ row }) => <Chip label={String(row.original.http_status || '?')} className={httpChip(row.original.http_status)} />, size: 55 },
  { accessorKey: 'url', header: 'URL', cell: ({ row }) => <span className="font-mono sf-text-label" title={row.original.url}>{trunc(row.original.url)}</span>, size: 300 },
  { accessorKey: 'host', header: 'Host', size: 140 },
  { id: 'tier', header: 'Tier', accessorFn: (r) => r.source_tier, cell: ({ row }) => <Chip label={`T${row.original.source_tier}`} className="sf-chip-neutral" />, size: 50 },
  { accessorKey: 'doc_kind', header: 'Kind', cell: ({ row }) => <Chip label={row.original.doc_kind || '-'} className="sf-chip-neutral" />, size: 60 },
  { id: 'sz', header: 'Size', accessorFn: (r) => r.size_bytes, cell: ({ row }) => <span className="font-mono sf-text-label sf-text-muted">{fmtBytes(row.original.size_bytes)}</span>, size: 70 },
  { accessorKey: 'crawled_at', header: 'Time', cell: ({ row }) => <span className="sf-text-muted">{relTime(row.original.crawled_at)}</span>, size: 70 },
];

/* ── Chart constants ──────────────────────────────────────────────── */

const C_OK = '#86efac';
const C_TIMEOUT = '#c084fc';
const C_BLOCKED = '#fcd34d';
const C_TT_BG = '#111f41';

/* ── Sub-components ───────────────────────────────────────────────── */

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

function FlowStep({ badge, badgeCls, value, valueCls, label, extra }: {
  badge: string; badgeCls: string; value: number; valueCls: string; label: string; extra?: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center sf-surface-elevated rounded-lg py-3 px-1 text-center">
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide mb-1.5 ${badgeCls}`}>{badge}</span>
      <span className={`text-[26px] font-extrabold leading-none tracking-tight ${valueCls}`}>{value}</span>
      <span className="text-[10px] sf-text-muted mt-1">{label}</span>
      {extra}
    </div>
  );
}

/* ── Generic Flow Row (caps at 8 steps per row, wraps to new rows) ─ */

interface FlowStepDef {
  badge: string;
  badgeCls: string;
  value: number;
  valueCls: string;
  label: string;
  extra?: React.ReactNode;
}

const STEPS_PER_ROW = 8;

function FlowPanel({ title, steps }: { title: string; steps: FlowStepDef[] }) {
  if (steps.length === 0) return null;
  const rows: FlowStepDef[][] = [];
  for (let i = 0; i < steps.length; i += STEPS_PER_ROW) {
    rows.push(steps.slice(i, i + STEPS_PER_ROW));
  }
  const arrow = <div className="w-4 flex items-center justify-center sf-text-subtle text-xs shrink-0">&rarr;</div>;
  return (
    <div className="sf-surface-card rounded-lg p-5">
      <div className="text-[12px] font-semibold sf-text-muted uppercase tracking-wide mb-3">{title}</div>
      <div className="space-y-2">
        {rows.map((row, ri) => (
          <div key={ri} className="flex items-stretch gap-0">
            {row.map((s, si) => (
              <Fragment key={s.badge}>
                {si > 0 && arrow}
                <FlowStep {...s} />
              </Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildPipelineSteps(f: RunFunnelSummary): FlowStepDef[] {
  return [
    { badge: 'Search', badgeCls: 'sf-callout-info', value: f.queries_executed, valueCls: 'text-[var(--sf-token-accent-strong)]', label: 'queries' },
    { badge: 'Results', badgeCls: 'sf-callout-info', value: f.results_found, valueCls: 'text-[var(--sf-token-state-info-fg)]', label: f.queries_executed > 0 ? `${Math.round(f.results_found / f.queries_executed)}/q` : '' },
    { badge: 'Unique', badgeCls: 'sf-callout-warning', value: f.candidates_unique, valueCls: 'text-[var(--sf-token-state-warning-fg)]', label: 'candidates' },
    { badge: 'LLM Kept', badgeCls: 'sf-callout-success', value: f.llm_kept, valueCls: 'text-[var(--sf-token-state-success-fg)]', label: 'selected', extra: f.llm_dropped > 0 ? <span className="sf-callout-danger text-[9px] font-semibold px-1.5 py-0 rounded mt-1">{f.llm_dropped} dropped</span> : undefined },
    { badge: 'Fetched', badgeCls: 'sf-callout-info', value: f.urls_ok, valueCls: 'text-[var(--sf-token-accent-strong)]', label: 'OK', extra: (f.urls_blocked > 0 || f.urls_error > 0) ? (
      <div className="flex gap-1 mt-1.5">
        {f.urls_blocked > 0 && <span className="sf-callout-danger text-[9px] font-semibold px-1.5 py-0 rounded">{f.urls_blocked} blocked</span>}
        {f.urls_error > 0 && <span className="text-[9px] font-semibold px-1.5 py-0 rounded" style={{ background: 'rgba(147,51,234,0.12)', color: '#c084fc' }}>{f.urls_error} timeout</span>}
      </div>
    ) : undefined },
    { badge: 'Parsed', badgeCls: 'sf-callout-info', value: f.docs_parsed, valueCls: 'text-[#c084fc]', label: pct(f.docs_parsed, f.urls_ok + f.urls_blocked + f.urls_error) },
  ];
}

function buildExtractionSteps(extraction: ExtractionSummary): FlowStepDef[] {
  // WHY: Dynamically built from plugin names — auto-scales with new extraction plugins.
  return Object.entries(extraction.plugins)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, stats]) => ({
      badge: name,
      badgeCls: 'sf-callout-success',
      value: stats.artifacts,
      valueCls: 'text-[var(--sf-token-state-success-fg)]',
      label: fmtBytes(stats.total_bytes),
    }));
}

function MiniDonut({ title, data }: { title: string; data: Array<{ name: string; value: number; color: string }> }) {
  if (data.length === 0) return (
    <div className="sf-surface-card rounded-lg p-4 text-center sf-text-muted sf-text-caption">
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2">{title}</div>
      <span>No data</span>
    </div>
  );
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="sf-surface-card rounded-lg p-4">
      <div className="text-[11px] font-semibold sf-text-muted uppercase tracking-wide mb-2">{title}</div>
      <div className="flex items-center gap-3">
        <ResponsiveContainer width={100} height={100}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={46} paddingAngle={2} dataKey="value">
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={{ background: C_TT_BG, border: 'none', fontSize: 11, borderRadius: 6 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1.5 min-w-0">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
              <span className="font-semibold tabular-nums">{d.value}</span>
              <span className="sf-text-muted truncate">{d.name}</span>
              <span className="sf-text-subtle text-[9px]">({pct(d.value, total)})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DomainHealthBars({ domains }: { domains: DomainBreakdownRow[] }) {
  const sorted = [...domains].sort((a, b) => b.urls - a.urls);
  const maxUrls = Math.max(...sorted.map((d) => d.urls), 1);
  return (
    <div className="space-y-2 max-h-[200px] overflow-y-auto">
      {sorted.map((d) => (
        <div key={d.domain} className="flex items-center gap-2.5">
          <span className="w-[130px] font-mono text-[10px] sf-text-primary truncate">{d.domain}</span>
          <div className="flex-1 h-4 rounded sf-surface-panel overflow-hidden flex">
            <div className="h-full rounded-l" style={{ width: `${(d.ok / maxUrls) * 100}%`, background: C_OK }} />
            {d.errors > 0 && <div className="h-full" style={{ width: `${(d.errors / maxUrls) * 100}%`, background: '#f87171' }} />}
          </div>
          <span className="w-10 text-right font-mono text-[10px]" style={{ color: d.errors > 0 ? '#f87171' : C_OK }}>
            {d.ok}/{d.urls}
          </span>
        </div>
      ))}
    </div>
  );
}

function ErrorsTab({ errors, run }: { errors: FetchErrorRow[]; run: ProductHistoryRunRow }) {
  const timeouts = errors.filter((e) => e.error_type === 'timeout').length;
  const blocked = errors.filter((e) => e.error_type.startsWith('http_4')).length;
  const serverErrors = errors.filter((e) => e.error_type === 'http_5xx').length;
  const affectedDomains = new Set(errors.map((e) => e.host)).size;

  // WHY: Group errors by domain for the "Problematic Domains" section.
  const byDomain = new Map<string, FetchErrorRow[]>();
  for (const e of errors) {
    if (!byDomain.has(e.host)) byDomain.set(e.host, []);
    byDomain.get(e.host)!.push(e);
  }

  return (
    <div className="space-y-4">
      {/* Error KPI row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="sf-surface-elevated rounded-lg p-4 text-center">
          <div className="text-[28px] font-bold sf-status-text-danger">{errors.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide sf-text-muted mt-1">Total Issues</div>
        </div>
        <div className="sf-surface-elevated rounded-lg p-4 text-center">
          <div className="text-[28px] font-bold sf-status-text-warning">{blocked}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide sf-text-muted mt-1">HTTP Blocked</div>
        </div>
        <div className="sf-surface-elevated rounded-lg p-4 text-center">
          <div className="text-[28px] font-bold" style={{ color: '#c084fc' }}>{timeouts}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide sf-text-muted mt-1">Timeouts</div>
        </div>
        <div className="sf-surface-elevated rounded-lg p-4 text-center">
          <div className="text-[28px] font-bold sf-text-primary">{affectedDomains}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide sf-text-muted mt-1">Domains Affected</div>
        </div>
      </div>

      {/* Error list */}
      {errors.length > 0 ? (
        <div className="sf-surface-elevated rounded-lg overflow-hidden divide-y sf-border-soft">
          {errors.map((e, i) => {
            const isTimeout = e.error_type === 'timeout';
            return (
              <div key={`${e.url}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-extrabold font-mono shrink-0 ${
                  isTimeout ? '' : 'sf-callout-warning'
                }`} style={isTimeout ? { background: 'rgba(147,51,234,0.12)', color: '#c084fc', border: '1px solid rgba(147,51,234,0.25)' } : undefined}>
                  {isTimeout ? 'T/O' : e.http_status}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-mono sf-text-label truncate">{e.url}</div>
                  <div className="text-[10px] sf-text-muted flex gap-4 mt-0.5">
                    <span>{e.host}</span>
                    <span>{e.domain_role}</span>
                    <span>{e.response_ms > 0 ? `${(e.response_ms / 1000).toFixed(1)}s` : ''}</span>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                  isTimeout ? '' : 'sf-callout-warning'
                }`} style={isTimeout ? { background: 'rgba(147,51,234,0.12)', color: '#c084fc' } : undefined}>
                  {isTimeout ? 'Timeout' : `HTTP ${e.http_status}`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 sf-text-muted sf-text-body-sm">No errors in this run.</div>
      )}

      {/* Problematic domains */}
      {byDomain.size > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-2">Problematic Domains</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...byDomain.entries()].map(([domain, errs]) => {
              const domainInfo = run.domains.find((d) => d.domain === domain);
              const total = domainInfo?.urls ?? errs.length;
              const types = [...new Set(errs.map((e) => e.error_type))].join(', ');
              return (
                <div key={domain} className="sf-surface-panel rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono font-bold sf-text-label">{domain}</span>
                    {domainInfo && <Chip label={domainInfo.safety} className={safetyChip(domainInfo.safety)} />}
                  </div>
                  <div className="text-[11px] sf-text-muted">
                    {errs.length} of {total} URLs failed <span className="sf-status-text-danger">({pct(errs.length, total)} failure)</span>
                  </div>
                  <div className="text-[10px] sf-text-subtle mt-0.5">Pattern: {types}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Empty fallback ───────────────────────────────────────────────── */

const EMPTY_AGG: ProductHistoryResponse['aggregate'] = {
  total_runs: 0, completed_runs: 0, failed_runs: 0,
  total_cost_usd: 0, avg_cost_per_run: 0, avg_duration_ms: 0,
  total_queries: 0, total_urls: 0, urls_success: 0, urls_failed: 0, unique_hosts: 0,
};

/* ── Main Component ───────────────────────────────────────────────── */

interface ProductHistoryPanelProps { productId: string; category: string }

export function ProductHistoryPanel({ productId, category }: ProductHistoryPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:history:collapsed:${productId}`, false);
  const [tab, setTab] = usePersistedTab<HistTab>(`indexing:history:tab:${productId}`, 'queries', { validValues: HIST_TAB_KEYS });
  const [selRunId, setSelRunId] = usePersistedTab<string>(`indexing:history:run:${productId}`, '');

  const { data, isLoading } = useQuery({
    queryKey: ['indexlab', 'product-history', category, productId],
    queryFn: () => api.get<ProductHistoryResponse>(
      `/indexlab/product-history?category=${encodeURIComponent(category)}&product_id=${encodeURIComponent(productId)}`
    ),
    enabled: Boolean(productId) && Boolean(category) && category !== 'all',
  });

  const selRun = useMemo(() => {
    if (!data?.runs.length) return undefined;
    return data.runs.find((r) => r.run_id === (selRunId || data.runs[0]?.run_id)) ?? data.runs[0];
  }, [data?.runs, selRunId]);

  const tabs = useMemo(() => buildTabs(selRun, data?.urls ?? [], data?.queries ?? []), [selRun, data?.urls, data?.queries]);
  const filtUrls = useMemo(() => selRun ? (data?.urls ?? []).filter((u) => u.run_id === selRun.run_id) : (data?.urls ?? []), [selRun, data?.urls]);
  const filtQueries = useMemo(() => selRun ? (data?.queries ?? []).filter((q) => q.run_id === selRun.run_id) : (data?.queries ?? []), [selRun, data?.queries]);

  const agg = data?.aggregate ?? EMPTY_AGG;

  // WHY: Build sparkline data arrays from per-run metrics for trend display.
  const sparkRuns = useMemo(() => (data?.runs ?? []).map(() => 1), [data?.runs]);
  const sparkCosts = useMemo(() => (data?.runs ?? []).map((r) => r.cost_usd), [data?.runs]);
  const sparkSuccess = useMemo(() => (data?.runs ?? []).map((r) => {
    const total = r.funnel.urls_ok + r.funnel.urls_blocked + r.funnel.urls_error;
    return total > 0 ? r.funnel.urls_ok / total : 0;
  }), [data?.runs]);
  const sparkDuration = useMemo(() => (data?.runs ?? []).map((r) => {
    if (!r.started_at || !r.ended_at) return 0;
    return new Date(r.ended_at).getTime() - new Date(r.started_at).getTime();
  }), [data?.runs]);

  const tierDonutData = useMemo(() => {
    if (!selRun) return [];
    const f = selRun.funnel;
    return [
      { name: 'T1 Seeds', value: f.tier1_queries ?? 0, color: '#f97583' },
      { name: 'T2 Groups', value: f.tier2_queries ?? 0, color: '#79c0ff' },
      { name: 'T3 Keys', value: f.tier3_queries ?? 0, color: '#7ee787' },
    ].filter((d) => d.value > 0);
  }, [selRun]);

  const urlOutcomeData = useMemo(() => {
    if (!selRun) return [];
    const f = selRun.funnel;
    return [
      { name: 'OK', value: f.urls_ok, color: C_OK },
      ...(f.urls_error > 0 ? [{ name: 'Timeout', value: f.urls_error, color: C_TIMEOUT }] : []),
      ...(f.urls_blocked > 0 ? [{ name: 'Blocked', value: f.urls_blocked, color: C_BLOCKED }] : []),
    ].filter((d) => d.value > 0);
  }, [selRun]);

  const domainSafetyData = useMemo(() => {
    if (!selRun) return [];
    const counts: Record<string, number> = {};
    for (const d of selRun.domains) counts[d.safety] = (counts[d.safety] || 0) + 1;
    const colorMap: Record<string, string> = { safe: C_OK, caution: C_BLOCKED, blocked: '#f87171', unknown: '#94a3b8' };
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: colorMap[name] || '#94a3b8' }));
  }, [selRun]);

  const domainRoleData = useMemo(() => {
    if (!selRun) return [];
    const counts: Record<string, number> = {};
    for (const d of selRun.domains) counts[d.role] = (counts[d.role] || 0) + 1;
    const colorMap: Record<string, string> = { manufacturer: '#818cf8', review: '#93c5fd', retailer: C_BLOCKED, support: '#c084fc', other: '#94a3b8', unknown: '#64748b' };
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: colorMap[name] || '#94a3b8' }));
  }, [selRun]);

  const llmSelectionData = useMemo(() => {
    if (!selRun) return [];
    const f = selRun.funnel;
    return [
      ...(f.llm_kept > 0 ? [{ name: 'Kept', value: f.llm_kept, color: C_OK }] : []),
      ...(f.llm_dropped > 0 ? [{ name: 'Dropped', value: f.llm_dropped, color: '#f87171' }] : []),
    ];
  }, [selRun]);

  if (!productId) return null;

  return (
    <div className="sf-surface-panel p-0 order-[-10] flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-6 pt-4 pb-0">
        <button onClick={toggleCollapsed} className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button" title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '+' : '-'}
        </button>
        <span className="text-[15px] font-bold sf-text-primary">Run History</span>
        <span className="font-mono text-[11px] sf-text-muted">{productId}</span>
        <Tip text="Pipeline history: searches, triage, crawl outcomes, and errors across all runs." />
      </div>

      {collapsed ? null : isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : !data || data.runs.length === 0 ? (
        <div className="text-center py-12 sf-text-muted">
          <p className="text-sm">No run history for this product yet.</p>
          <p className="sf-text-caption mt-1">Run IndexLab above to start building history.</p>
        </div>
      ) : (
        <div className="px-6 pb-6 pt-4 space-y-5 flex-1 min-h-0 overflow-y-auto">

          {/* ─── KPI Cards ──────────────────────────────────────── */}
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

          {/* ─── Run Selector ───────────────────────────────────── */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-2">Select Run</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.runs.map((r) => (
                <button key={r.run_id} onClick={() => setSelRunId(r.run_id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg sf-text-label whitespace-nowrap transition-all ${
                    selRun?.run_id === r.run_id ? 'sf-surface-elevated sf-border-accent border' : 'sf-surface-elevated border sf-border-soft'
                  }`}>
                  <TrafficLight color={r.status === 'completed' ? 'green' : r.status === 'failed' ? 'red' : 'gray'} />
                  <span className="font-mono font-semibold">{r.run_id.slice(0, 15)}</span>
                  <span className="sf-text-muted">{relTime(r.started_at)}</span>
                  <span className="font-mono sf-status-text-warning">{fmtCost(r.cost_usd)}</span>
                  <span className="sf-text-muted">{fmtDur(r.started_at, r.ended_at)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ─── Pipeline Funnel ─────────────────────────────────── */}
                    {selRun && (
            <>
              <FlowPanel title="Pipeline Flow" steps={buildPipelineSteps(selRun.funnel)} />
              <FlowPanel title="Extraction Flow" steps={buildExtractionSteps(selRun.extraction)} />
            </>
          )}

          {/* ─── Charts 2x2 Grid ─────────────────────────────────── */}
          {selRun && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <MiniDonut title="Tier Allocation" data={tierDonutData} />
              <MiniDonut title="URL Outcomes" data={urlOutcomeData} />
              <MiniDonut title="Domain Safety" data={domainSafetyData} />
              <MiniDonut title="Domain Roles" data={domainRoleData} />
              <MiniDonut title="LLM Selection" data={llmSelectionData} />
            </div>
          )}

          {/* ─── Tabs ───────────────────────────────────────────── */}
          <TabStrip tabs={tabs} activeTab={tab} onSelect={setTab} />

          {tab === 'queries' && <DataTable data={filtQueries} columns={queryColumns} searchable persistKey="ph-queries" maxHeight="max-h-[520px]" />}
          {tab === 'domains' && selRun && <DataTable data={selRun.domains} columns={domainColumns} persistKey="ph-domains" maxHeight="max-h-[520px]" />}
          {tab === 'urls' && <DataTable data={filtUrls} columns={urlColumns} searchable persistKey="ph-urls" maxHeight="max-h-[520px]" />}
          {tab === 'errors' && selRun && <ErrorsTab errors={selRun.errors} run={selRun} />}
        </div>
      )}
    </div>
  );
}
