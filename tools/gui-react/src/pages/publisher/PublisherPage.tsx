import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from '../../api/client.ts';
import { useUiStore } from '../../stores/uiStore.ts';
import { DataTable } from '../../shared/ui/data-display/DataTable.tsx';
import { Chip } from '../../shared/ui/feedback/Chip.tsx';
import type {
  PublisherCandidatesResponse,
  PublisherCandidateRow,
  PublisherStats,
  PublisherRepairEntry,
  PublisherSourceEntry,
  PublisherLlmRepairDecision,
} from './types.ts';

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${day} ${hh}:${mm}`;
}

function truncateValue(val: string | null | undefined, max = 60): string {
  if (val == null) return '—';
  if (val.length <= max) return val;
  return val.slice(0, max) + '...';
}

function confidenceClass(conf: number): string {
  if (conf >= 80) return 'sf-status-text-success';
  if (conf >= 50) return 'sf-status-text-warning';
  return 'sf-status-text-danger';
}

function sourceChipClass(sources: PublisherSourceEntry[]): string {
  const src = sources[0]?.source ?? sources[0]?.model ?? '';
  if (src.includes('override')) return 'sf-chip-warning';
  if (src.includes('cef') || sources[0]?.model) return 'sf-chip-accent';
  return 'sf-chip-confirm';
}

function sourceLabel(sources: PublisherSourceEntry[]): string {
  const first = sources[0];
  if (!first) return '—';
  if (first.source) return first.source;
  if (first.model) return 'cef';
  if (first.artifact) return 'pipeline';
  if (first.overridden_by) return 'override';
  return 'unknown';
}

function repairCount(row: PublisherCandidateRow): number {
  return row.validation_json?.repairs?.length ?? 0;
}

// ── Stat card ────────────────────────────────────────────────────────

function StatCard({ label, value, colorClass }: { label: string; value: number | string; colorClass?: string }) {
  return (
    <div className="sf-surface-elevated rounded px-4 py-3 border sf-border-default min-w-0">
      <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-semibold"
        style={{ fontSize: 10, letterSpacing: '0.08em' }}
      >
        {label}
      </div>
      <div className={`text-xl font-bold tracking-tight mt-1 ${colorClass ?? 'sf-text-primary'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// ── Filter chips ─────────────────────────────────────────────────────

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-[0.03em] border transition-colors cursor-pointer ${
        active
          ? 'sf-chip-accent border-current'
          : 'sf-chip-neutral border-transparent'
      }`}
    >
      {label}
    </button>
  );
}

// ── Expanded row ─────────────────────────────────────────────────────

function RepairDetail({ repair }: { repair: PublisherRepairEntry }) {
  const before = typeof repair.before === 'object' ? JSON.stringify(repair.before) : String(repair.before ?? '');
  const after = typeof repair.after === 'object' ? JSON.stringify(repair.after) : String(repair.after ?? '');
  return (
    <tr>
      <td className="px-2 py-1 sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{repair.step}</td>
      <td className="px-2 py-1 sf-status-text-danger" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11, textDecoration: 'line-through', opacity: 0.7 }}>{before}</td>
      <td className="px-2 py-1" style={{ color: 'var(--sf-token-accent-strong)', fontSize: 10 }}>&rarr;</td>
      <td className="px-2 py-1 sf-status-text-success" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{after}</td>
      <td className="px-2 py-1">
        <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold" style={{ background: 'rgb(var(--sf-color-accent-rgb) / 0.12)', color: 'var(--sf-token-accent-strong)' }}>
          {repair.rule}
        </span>
      </td>
    </tr>
  );
}

function LlmDecisionRow({ decision }: { decision: PublisherLlmRepairDecision }) {
  const decisionChipClass =
    decision.decision === 'map_to_existing' ? 'sf-chip-info'
    : decision.decision === 'keep_new' ? 'sf-chip-success'
    : decision.decision === 'set_unk' ? 'sf-chip-warning'
    : 'sf-chip-danger';
  return (
    <tr>
      <td className="px-2 py-1" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>
        {decision.value}
      </td>
      <td className="px-2 py-1">
        <Chip label={decision.decision} className={decisionChipClass} />
      </td>
      <td className="px-2 py-1 sf-status-text-success" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>
        {decision.resolved_to ?? '—'}
      </td>
      <td className="px-2 py-1 sf-text-muted" style={{ fontSize: 11, whiteSpace: 'normal', maxWidth: 260 }}>
        {decision.reasoning ?? '—'}
      </td>
    </tr>
  );
}

function SourceRow({ source }: { source: PublisherSourceEntry }) {
  const identifier = source.model ?? source.artifact?.slice(0, 10) ?? source.overridden_by ?? '—';
  return (
    <tr>
      <td className="px-2 py-1" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{identifier}</td>
      <td className="px-2 py-1 sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{source.confidence ?? '—'}</td>
      <td className="px-2 py-1 sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{source.run_id ?? '—'}</td>
      <td className="px-2 py-1 sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{formatDate(source.submitted_at)}</td>
    </tr>
  );
}

function ExpandedRowContent({ row }: { row: PublisherCandidateRow }) {
  const repairs = row.validation_json?.repairs ?? [];
  const rejections = row.validation_json?.rejections ?? [];
  const llmRepair = row.validation_json?.llmRepair ?? null;
  const sources = row.sources_json ?? [];
  const softRejections = rejections.filter((r) => r.reason_code === 'unknown_enum_prefer_known');

  let formattedValue = row.value ?? '';
  try {
    const parsed = JSON.parse(formattedValue);
    formattedValue = JSON.stringify(parsed, null, 2);
  } catch { /* raw string is fine */ }

  return (
    <div className="flex gap-4 p-4" style={{ background: 'rgb(var(--sf-color-panel-rgb) / 0.45)' }}>
      {/* LEFT: Validation */}
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div className="sf-surface-elevated rounded border sf-border-default p-3">
          <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-2" style={{ fontSize: 10 }}>
            Validation Detail
          </div>
          {repairs.length > 0 ? (
            <div className="mb-2">
              <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-1.5" style={{ fontSize: 10 }}>
                Repairs Applied
                <span className="ml-1.5 px-1 py-0.5 rounded-sm text-[9px]" style={{ background: 'rgb(var(--sf-color-accent-rgb) / 0.12)', color: 'var(--sf-token-accent-strong)' }}>
                  {repairs.length}
                </span>
              </div>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgb(var(--sf-color-surface-rgb) / 0.5)' }}>
                    <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Step</th>
                    <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Before</th>
                    <th className="px-2 py-1" style={{ width: 20 }}></th>
                    <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>After</th>
                    <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.map((r, i) => <RepairDetail key={i} repair={r} />)}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sf-text-subtle" style={{ fontSize: 11 }}>No repairs or rejections.</div>
          )}
          {softRejections.length > 0 && (
            <div className="mt-2 rounded p-2 border" style={{ background: 'var(--sf-token-state-warning-bg)', borderColor: 'var(--sf-token-state-warning-border)' }}>
              <div className="font-bold uppercase" style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--sf-token-state-warning-fg)' }}>
                Soft Rejection (accepted)
              </div>
              <div className="sf-text-muted mt-0.5" style={{ fontSize: 11 }}>
                Value not in known list but accepted under open_prefer_known policy.
              </div>
            </div>
          )}
          {llmRepair && llmRepair.decisions && llmRepair.decisions.length > 0 && (
            <div className="mt-2 rounded p-2 border" style={{ background: 'rgb(var(--sf-color-accent-rgb) / 0.08)', borderColor: 'rgb(var(--sf-color-accent-rgb) / 0.3)' }}>
              <div className="font-bold uppercase mb-1.5 flex items-center gap-2" style={{ fontSize: 10, letterSpacing: '0.04em', color: 'var(--sf-token-accent-strong)' }}>
                LLM Repair
                <Chip label={llmRepair.status ?? '—'} className={llmRepair.status === 'repaired' ? 'sf-chip-success' : 'sf-chip-warning'} />
                {llmRepair.promptId && (
                  <span className="sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 9, fontWeight: 400, textTransform: 'none' }}>
                    prompt: {llmRepair.promptId}
                  </span>
                )}
              </div>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgb(var(--sf-color-surface-rgb) / 0.5)' }}>
                    <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Value</th>
                    <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Decision</th>
                    <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Resolved To</th>
                    <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {llmRepair.decisions.map((d, i) => <LlmDecisionRow key={i} decision={d} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sf-surface-elevated rounded border sf-border-default p-3">
          <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-2" style={{ fontSize: 10 }}>
            Full Value
          </div>
          <pre className="sf-surface-panel rounded border sf-border-default p-2.5 overflow-auto sf-text-muted"
            style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11, lineHeight: 1.6, maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {formattedValue}
          </pre>
        </div>
      </div>

      {/* RIGHT: Sources + Metadata */}
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div className="sf-surface-elevated rounded border sf-border-default p-3">
          <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-2" style={{ fontSize: 10 }}>
            Source History
            <span className="ml-1.5 px-1 py-0.5 rounded-sm text-[9px]" style={{ background: 'rgb(var(--sf-color-accent-rgb) / 0.12)', color: 'var(--sf-token-accent-strong)' }}>
              {sources.length} {sources.length === 1 ? 'source' : 'sources'}
            </span>
          </div>
          {sources.length > 0 ? (
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'rgb(var(--sf-color-surface-rgb) / 0.5)' }}>
                  <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Source</th>
                  <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Conf</th>
                  <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Run ID</th>
                  <th className="px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase" style={{ fontSize: 9, letterSpacing: '0.05em' }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s, i) => <SourceRow key={i} source={s} />)}
              </tbody>
            </table>
          ) : (
            <div className="sf-text-subtle" style={{ fontSize: 11 }}>No source data.</div>
          )}
        </div>

        <div className="sf-surface-elevated rounded border sf-border-default p-3">
          <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-2" style={{ fontSize: 10 }}>
            Candidate Metadata
          </div>
          <div className="grid grid-cols-2 gap-2" style={{ fontSize: 11 }}>
            <div>
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>CANDIDATE ID</div>
              <div className="sf-text-primary" style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{row.id}</div>
            </div>
            <div>
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>STATUS</div>
              <div>
                <Chip label={row.status} className={row.status === 'resolved' ? 'sf-chip-info' : 'sf-chip-success'} />
              </div>
            </div>
            <div>
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>MAX CONFIDENCE</div>
              <div className={confidenceClass(row.confidence)} style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{row.confidence}</div>
            </div>
            <div>
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>SOURCE COUNT</div>
              <div className="sf-text-primary" style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{row.source_count}</div>
            </div>
            <div>
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>SUBMITTED</div>
              <div className="sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{formatDate(row.submitted_at)}</div>
            </div>
            <div>
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>UPDATED</div>
              <div className="sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{formatDate(row.updated_at)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page-level filter state ──────────────────────────────────────────

type DateRange = '24h' | '7d' | '30d' | 'all';
type StatusFilter = 'all' | 'candidate' | 'resolved';

const DATE_RANGES: DateRange[] = ['24h', '7d', '30d', 'all'];
const STATUS_FILTERS: StatusFilter[] = ['all', 'candidate', 'resolved'];

// ── Main page ────────────────────────────────────────────────────────

export function PublisherPage() {
  const category = useUiStore((s) => s.category);

  // Filter state
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [fieldFilter, setFieldFilter] = useState('');
  const [searchText, setSearchText] = useState('');

  const { data, isLoading } = useQuery<PublisherCandidatesResponse>({
    queryKey: ['publisher', category, page, limit],
    queryFn: () => api.get<PublisherCandidatesResponse>(`/publisher/${category}/candidates?page=${page}&limit=${limit}`),
    enabled: Boolean(category),
    refetchInterval: 10_000,
  });

  const stats: PublisherStats = data?.stats ?? { total: 0, resolved: 0, pending: 0, repaired: 0, products: 0 };

  // Client-side filtering (server returns full page; we refine here)
  const filteredRows = useMemo(() => {
    let rows = data?.rows ?? [];

    // Date filter
    if (dateRange !== 'all') {
      const now = Date.now();
      const ms = dateRange === '24h' ? 86_400_000 : dateRange === '7d' ? 604_800_000 : 2_592_000_000;
      rows = rows.filter((r) => new Date(r.submitted_at).getTime() > now - ms);
    }

    // Status filter
    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    // Field filter
    if (fieldFilter) {
      rows = rows.filter((r) => r.field_key === fieldFilter);
    }

    // Search text
    if (searchText) {
      const q = searchText.toLowerCase();
      rows = rows.filter((r) =>
        r.product_id.toLowerCase().includes(q) ||
        (r.brand ?? '').toLowerCase().includes(q) ||
        (r.model ?? '').toLowerCase().includes(q)
      );
    }

    return rows;
  }, [data?.rows, dateRange, statusFilter, fieldFilter, searchText]);

  // Derive unique field keys for dropdown
  const fieldKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of data?.rows ?? []) keys.add(r.field_key);
    return Array.from(keys).sort();
  }, [data?.rows]);

  // ── Columns ──────────────────────────────────────────────────────

  const columns: ColumnDef<PublisherCandidateRow, unknown>[] = useMemo(() => [
    {
      accessorKey: 'submitted_at',
      header: 'Submitted',
      cell: ({ getValue }) => (
        <span className="sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>
          {formatDate(getValue() as string)}
        </span>
      ),
      size: 110,
    },
    {
      accessorKey: 'product_id',
      header: 'Product',
      cell: ({ getValue }) => (
        <span className="sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>
          {getValue() as string}
        </span>
      ),
      size: 140,
    },
    {
      accessorKey: 'brand',
      header: 'Brand',
      cell: ({ getValue }) => <span className="sf-text-primary" style={{ fontSize: 12 }}>{(getValue() as string) || '—'}</span>,
      size: 90,
    },
    {
      accessorKey: 'field_key',
      header: 'Field',
      cell: ({ getValue }) => (
        <span className="sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>
          {getValue() as string}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: 'value',
      header: 'Value',
      cell: ({ getValue }) => (
        <span className="sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11, maxWidth: 260, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {truncateValue(getValue() as string | null)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return <Chip label={s} className={s === 'resolved' ? 'sf-chip-info' : 'sf-chip-success'} />;
      },
      size: 82,
    },
    {
      accessorKey: 'confidence',
      header: 'Conf',
      cell: ({ getValue }) => {
        const c = getValue() as number;
        return (
          <div className="flex items-center gap-1.5">
            <div className="rounded-full overflow-hidden" style={{ width: 22, height: 5, background: 'rgb(var(--sf-color-border-default-rgb) / 0.4)' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, c)}%`,
                  background: c >= 80 ? 'var(--sf-token-state-success-fg)' : c >= 50 ? 'var(--sf-token-state-warning-fg)' : 'var(--sf-token-state-error-fg)',
                }}
              />
            </div>
            <span className="sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{c}</span>
          </div>
        );
      },
      size: 70,
    },
    {
      accessorKey: 'source_count',
      header: 'Src#',
      cell: ({ getValue }) => (
        <span className="sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11, textAlign: 'center', display: 'inline-block', width: '100%' }}>
          {getValue() as number}
        </span>
      ),
      size: 48,
    },
    {
      id: 'source_type',
      header: 'Source',
      cell: ({ row }) => {
        const sources = row.original.sources_json ?? [];
        return <Chip label={sourceLabel(sources)} className={sourceChipClass(sources)} />;
      },
      size: 76,
    },
    {
      id: 'repairs',
      header: 'Repairs',
      cell: ({ row }) => {
        const count = repairCount(row.original);
        return <Chip label={String(count)} className={count > 0 ? 'sf-chip-info' : 'sf-chip-neutral'} />;
      },
      size: 60,
    },
  ], []);

  // ── Expanded row renderer ────────────────────────────────────────

  const renderExpandedRow = useCallback((row: PublisherCandidateRow): ReactNode => {
    return <ExpandedRowContent row={row} />;
  }, []);

  // ── Pagination ───────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  const pageButtons = useMemo(() => {
    const pages: (number | '...')[] = [];
    for (let i = 1; i <= Math.min(3, totalPages); i++) pages.push(i);
    if (totalPages > 5 && page > 4) pages.push('...');
    if (page > 3 && page < totalPages - 2) pages.push(page);
    if (totalPages > 5 && page < totalPages - 3) pages.push('...');
    for (let i = Math.max(totalPages - 2, 4); i <= totalPages; i++) {
      if (!pages.includes(i)) pages.push(i);
    }
    return pages;
  }, [totalPages, page]);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold sf-text-primary">Publisher</h2>
        <Chip label={category || '—'} className="sf-chip-accent" />
        <span className="sf-text-muted" style={{ fontSize: 12 }}>
          Validation audit log — every candidate submission, repair, and rejection.
        </span>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Total Candidates" value={stats.total} />
        <StatCard label="Resolved" value={stats.resolved} colorClass="sf-status-text-success" />
        <StatCard label="Pending" value={stats.pending} colorClass="sf-status-text-warning" />
        <StatCard label="Repairs Applied" value={stats.repaired} colorClass="sf-status-text-info" />
        <StatCard label="Products" value={stats.products} colorClass="sf-text-muted" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 sf-surface-panel rounded border sf-border-default px-4 py-2.5">
        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <span className="sf-text-subtle uppercase font-semibold" style={{ fontSize: 10, letterSpacing: '0.06em' }}>Date</span>
          <div className="flex gap-1">
            {DATE_RANGES.map((r) => (
              <FilterChip key={r} label={r} active={dateRange === r} onClick={() => setDateRange(r)} />
            ))}
          </div>
        </div>

        <div className="w-px h-6 sf-border-default" style={{ background: 'var(--sf-token-border-default)' }} />

        {/* Product search */}
        <div className="flex items-center gap-1.5">
          <span className="sf-text-subtle uppercase font-semibold" style={{ fontSize: 10, letterSpacing: '0.06em' }}>Product</span>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search ID or model..."
            className="sf-input sf-primitive-input px-2 py-1 rounded-sm text-xs"
            style={{ minWidth: 150 }}
          />
        </div>

        <div className="w-px h-6 sf-border-default" style={{ background: 'var(--sf-token-border-default)' }} />

        {/* Field filter */}
        <div className="flex items-center gap-1.5">
          <span className="sf-text-subtle uppercase font-semibold" style={{ fontSize: 10, letterSpacing: '0.06em' }}>Field</span>
          <select
            value={fieldFilter}
            onChange={(e) => setFieldFilter(e.target.value)}
            className="sf-input sf-primitive-input px-2 py-1 rounded-sm text-xs"
          >
            <option value="">All fields</option>
            {fieldKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        <div className="w-px h-6 sf-border-default" style={{ background: 'var(--sf-token-border-default)' }} />

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <span className="sf-text-subtle uppercase font-semibold" style={{ fontSize: 10, letterSpacing: '0.06em' }}>Status</span>
          <div className="flex gap-1">
            {STATUS_FILTERS.map((s) => (
              <FilterChip key={s} label={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="sf-surface-elevated rounded border sf-border-default py-12 text-center">
          <span className="sf-text-muted text-sm">Loading candidates...</span>
        </div>
      ) : (
        <DataTable
          data={filteredRows}
          columns={columns}
          maxHeight="max-h-[calc(100vh-400px)]"
          persistKey="publisher:table"
          renderExpandedRow={renderExpandedRow}
        />
      )}

      {/* Pagination */}
      {!isLoading && (data?.total ?? 0) > 0 && (
        <div className="flex items-center justify-between sf-surface-panel rounded border sf-border-default px-4 py-2.5">
          <span className="sf-text-subtle" style={{ fontSize: 11 }}>
            Showing <strong className="sf-text-primary">{((page - 1) * limit) + 1}–{Math.min(page * limit, data?.total ?? 0)}</strong> of <strong className="sf-text-primary">{(data?.total ?? 0).toLocaleString()}</strong> candidates
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1 rounded-sm text-xs font-semibold border sf-border-default sf-surface-elevated sf-text-muted disabled:opacity-30 cursor-pointer"
            >
              Prev
            </button>
            {pageButtons.map((p, i) =>
              p === '...' ? (
                <span key={`dots-${i}`} className="sf-text-subtle px-1" style={{ fontSize: 11 }}>...</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`px-2.5 py-1 rounded-sm text-xs font-semibold border cursor-pointer ${
                    page === p
                      ? 'sf-chip-accent border-current'
                      : 'sf-border-default sf-surface-elevated sf-text-muted'
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded-sm text-xs font-semibold border sf-border-default sf-surface-elevated sf-text-muted disabled:opacity-30 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
