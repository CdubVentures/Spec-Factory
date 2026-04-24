import { useMemo, useCallback, type ReactNode } from 'react';
import { usePersistedTab, usePersistedNumber } from '../../stores/tabStore.ts';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from '../../api/client.ts';
import { useUiStore } from '../../stores/uiStore.ts';
import { DataTable } from '../../shared/ui/data-display/DataTable.tsx';
import { Chip } from '../../shared/ui/feedback/Chip.tsx';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
import { useFormatDateTime, useTimezoneLabel, parseBackendMs } from '../../utils/dateTime.ts';
import { formatCellValue } from '../../utils/fieldNormalize.ts';
import type {
  PublisherCandidatesResponse,
  PublisherCandidateRow,
  PublisherStats,
  PublisherRepairEntry,
  PublisherSourceEntry,
  EvidenceRef,
} from './types.ts';

// ── Helpers ──────────────────────────────────────────────────────────

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

function publishStatusLabel(row: PublisherCandidateRow): { label: string; cls: string; tip: string } {
  if (row.unknown_stripped) {
    return { label: 'skip', cls: 'sf-chip-neutral', tip: 'Finder returned unk; no candidate was published.' };
  }
  if (row.status === 'resolved') {
    return { label: '\u2713', cls: 'sf-chip-success', tip: 'Published' };
  }
  const pr = row.metadata_json?.publish_result;
  if (!pr) {
    // No publish attempt recorded — check for validation rejections
    const rejections = row.validation_json?.rejections ?? [];
    if (rejections.length > 0) {
      const code = rejections[0].reason_code;
      return { label: code, cls: 'sf-chip-danger', tip: `Validation rejected: ${code}` };
    }
    return { label: '—', cls: 'sf-chip-neutral', tip: 'Not yet evaluated' };
  }
  if (pr.status === 'below_threshold') {
    return { label: `< ${pr.threshold ?? '?'}`, cls: 'sf-chip-warning', tip: `Confidence ${pr.confidence} below threshold ${pr.threshold}` };
  }
  if (pr.status === 'manual_override_locked') {
    return { label: 'locked', cls: 'sf-chip-accent', tip: 'Manual override is published — candidates skip auto-publish' };
  }
  if (pr.status === 'skipped') {
    return { label: 'skip', cls: 'sf-chip-neutral', tip: pr.reason || 'Publish skipped' };
  }
  return { label: pr.status, cls: 'sf-chip-neutral', tip: pr.status };
}

function unknownStatusLabel(row: PublisherCandidateRow): { label: string; cls: string; tip: string } {
  if (!row.unknown_stripped) {
    return { label: '', cls: 'sf-chip-neutral', tip: 'Candidate value was not stripped as unk.' };
  }
  const reason = row.unknown_reason ? ` Reason: ${row.unknown_reason}` : '';
  return {
    label: '\u2713',
    cls: 'sf-chip-warning',
    tip: `Finder returned unk; value was stripped and left blank.${reason}`,
  };
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

// ── Expanded row sub-components ──────────────────────────────────────

function RepairDetail({ repair }: { repair: PublisherRepairEntry }) {
  const before = typeof repair.before === 'object' ? JSON.stringify(repair.before) : formatCellValue(repair.before);
  const after = typeof repair.after === 'object' ? JSON.stringify(repair.after) : formatCellValue(repair.after);
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

function SourceRow({ source }: { source: PublisherSourceEntry }) {
  const formatDate = useFormatDateTime();
  const identifier = source.model ?? source.artifact?.slice(0, 10) ?? source.overridden_by ?? '—';
  return (
    <tr>
      <td className="px-2 py-1" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{identifier}</td>
      <td className="px-2 py-1 sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{source.confidence ?? '—'}</td>
      <td className="px-2 py-1 sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{source.run_id ?? '—'}</td>
      <td className="px-2 py-1 sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>{formatDate(source.submitted_at) || '—'}</td>
    </tr>
  );
}

// ── Shared detail table header ───────────────────────────────────────

const detailThCls = "px-2 py-1 text-left sf-text-caption sf-status-text-muted uppercase";
const detailThStyle = { fontSize: 9, letterSpacing: '0.05em' } as const;
const detailHeadRowStyle = { background: 'rgb(var(--sf-color-surface-rgb) / 0.5)' } as const;

// ── Evidence URL classification helpers ─────────────────────────────

function statusChipClass(status: number | null): string {
  if (status === null) return 'sf-chip-neutral';
  if (status >= 200 && status < 300) return 'sf-chip-success';
  if (status === 0) return 'sf-chip-warning';  // network error / unknown
  return 'sf-chip-danger';  // 4xx / 5xx
}

function statusLabel(status: number | null): string {
  if (status === null) return '—';
  if (status === 0) return 'net err';
  return String(status);
}

function EvidenceUrlRow({ entry }: { entry: EvidenceRef }) {
  return (
    <tr className="sf-border-subtle" style={{ borderBottom: '1px solid' }}>
      <td className="py-1 px-1.5"><Chip label={entry.tier} className="sf-chip-neutral" /></td>
      <td className="py-1 px-1.5"><Chip label={statusLabel(entry.http_status)} className={statusChipClass(entry.http_status)} /></td>
      <td className="py-1 px-1.5">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="sf-text-muted"
          style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 10, wordBreak: 'break-all' }}
        >
          {entry.url}
        </a>
      </td>
    </tr>
  );
}

function EvidenceUrlsCard({ row }: { row: PublisherCandidateRow }) {
  const refs = row.evidence ?? [];
  const accepted = refs.filter((r) => r.accepted === 1);
  const rejected = refs.filter((r) => r.accepted === 0);

  if (refs.length === 0) {
    return (
      <div className="sf-surface-elevated rounded border sf-border-default p-3">
        <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-2" style={{ fontSize: 10 }}>
          Evidence URLs
        </div>
        <div className="sf-text-subtle" style={{ fontSize: 11 }}>No evidence URLs cited.</div>
      </div>
    );
  }

  return (
    <div className="sf-surface-elevated rounded border sf-border-default p-3">
      <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-2" style={{ fontSize: 10 }}>
        Evidence URLs
      </div>
      {accepted.length > 0 && (
        <div className="mb-2">
          <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-1.5 flex items-center gap-2" style={{ fontSize: 10 }}>
            Accepted
            <Chip label={String(accepted.length)} className="sf-chip-success" />
          </div>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={detailHeadRowStyle}>
                <th className={detailThCls} style={detailThStyle}>Tier</th>
                <th className={detailThCls} style={detailThStyle}>Status</th>
                <th className={detailThCls} style={detailThStyle}>URL</th>
              </tr>
            </thead>
            <tbody>
              {accepted.map((r, i) => <EvidenceUrlRow key={`acc-${i}`} entry={r} />)}
            </tbody>
          </table>
        </div>
      )}
      {rejected.length > 0 && (
        <div className={accepted.length > 0 ? 'mt-2' : ''}>
          <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-1.5 flex items-center gap-2" style={{ fontSize: 10 }}>
            Rejected
            <Chip label={String(rejected.length)} className="sf-chip-danger" />
          </div>
          <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={detailHeadRowStyle}>
                <th className={detailThCls} style={detailThStyle}>Tier</th>
                <th className={detailThCls} style={detailThStyle}>Status</th>
                <th className={detailThCls} style={detailThStyle}>URL</th>
              </tr>
            </thead>
            <tbody>
              {rejected.map((r, i) => <EvidenceUrlRow key={`rej-${i}`} entry={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Expanded row content ─────────────────────────────────────────────

function ExpandedRowContent({ row }: { row: PublisherCandidateRow }) {
  const formatDate = useFormatDateTime();
  const repairs = row.validation_json?.repairs ?? [];
  const rejections = row.validation_json?.rejections ?? [];
  const sourceType = row.source_type || '';
  const sourceId = row.source_id || '';

  let formattedValue = row.value ?? '';
  try {
    const parsed = JSON.parse(formattedValue);
    formattedValue = JSON.stringify(parsed, null, 2);
  } catch {
    formattedValue = formatCellValue(formattedValue);
  }

  return (
    <div className="flex gap-4 p-4" style={{ background: 'rgb(var(--sf-color-panel-rgb) / 0.45)' }}>
      {/* LEFT: Validation */}
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div className="sf-surface-elevated rounded border sf-border-default p-3">
          <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-2" style={{ fontSize: 10 }}>
            Validation Detail
          </div>

          {/* Repairs */}
          {repairs.length > 0 && (
            <div className="mb-2">
              <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-1.5" style={{ fontSize: 10 }}>
                Repairs Applied
                <span className="ml-1.5 px-1 py-0.5 rounded-sm text-[9px]" style={{ background: 'rgb(var(--sf-color-accent-rgb) / 0.12)', color: 'var(--sf-token-accent-strong)' }}>
                  {repairs.length}
                </span>
              </div>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={detailHeadRowStyle}>
                    <th className={detailThCls} style={detailThStyle}>Step</th>
                    <th className={detailThCls} style={detailThStyle}>Before</th>
                    <th className="px-2 py-1" style={{ width: 20 }}></th>
                    <th className={detailThCls} style={detailThStyle}>After</th>
                    <th className={detailThCls} style={detailThStyle}>Rule</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.map((r, i) => <RepairDetail key={i} repair={r} />)}
                </tbody>
              </table>
            </div>
          )}

          {/* Rejections */}
          {rejections.length > 0 && (
            <div className={repairs.length > 0 ? 'mt-2' : ''}>
              <div className="sf-text-caption sf-status-text-muted uppercase tracking-wider font-bold mb-1.5" style={{ fontSize: 10 }}>
                Rejections
                <span className="ml-1.5 px-1 py-0.5 rounded-sm text-[9px]" style={{ background: 'var(--sf-token-state-warning-bg)', color: 'var(--sf-token-state-warning-fg)' }}>
                  {rejections.length}
                </span>
              </div>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={detailHeadRowStyle}>
                    <th className={detailThCls} style={detailThStyle}>Reason Code</th>
                    <th className={detailThCls} style={detailThStyle}>Severity</th>
                    <th className={detailThCls} style={detailThStyle}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rejections.map((r, i) => {
                    const isSoft = r.reason_code === 'unknown_enum_prefer_known';
                    const detailStr = r.detail ? JSON.stringify(r.detail) : '—';
                    return (
                      <tr key={i}>
                        <td className="px-2 py-1" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>
                          {r.reason_code}
                        </td>
                        <td className="px-2 py-1">
                          <Chip label={isSoft ? 'soft' : 'hard'} className={isSoft ? 'sf-chip-warning' : 'sf-chip-danger'} />
                        </td>
                        <td className="px-2 py-1 sf-text-muted" style={{ fontSize: 11, whiteSpace: 'normal', maxWidth: 300 }}>
                          {detailStr}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Clean pass */}
          {repairs.length === 0 && rejections.length === 0 && (
            <div className="sf-text-subtle" style={{ fontSize: 11 }}>No repairs or rejections — value passed all checks.</div>
          )}
        </div>

        {/* Full Value */}
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
            Source
          </div>
          {sourceId ? (
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={detailHeadRowStyle}>
                  <th className={detailThCls} style={detailThStyle}>Type</th>
                  <th className={detailThCls} style={detailThStyle}>Model</th>
                  <th className={detailThCls} style={detailThStyle}>Source ID</th>
                  <th className={detailThCls} style={detailThStyle}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                <tr className="sf-border-subtle" style={{ borderBottom: '1px solid' }}>
                  <td className="py-1 px-1.5 sf-text-primary">{sourceType || '—'}</td>
                  <td className="py-1 px-1.5 sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{row.llm_model || '—'}</td>
                  <td className="py-1 px-1.5 sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 10, wordBreak: 'break-all' }}>{sourceId}</td>
                  <td className="py-1 px-1.5 sf-text-muted">{formatDate(row.submitted_at) || '—'}</td>
                </tr>
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
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>SOURCE</div>
              <div className="sf-text-primary" style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{row.source_type || '—'}</div>
            </div>
            <div>
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>SUBMITTED</div>
              <div className="sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{formatDate(row.submitted_at) || '—'}</div>
            </div>
            <div>
              <div className="sf-text-subtle" style={{ fontSize: 10 }}>UPDATED</div>
              <div className="sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)' }}>{formatDate(row.updated_at) || '—'}</div>
            </div>
          </div>
        </div>

        <EvidenceUrlsCard row={row} />
      </div>
    </div>
  );
}

// ── Page-level filter state ──────────────────────────────────────────

type DateRange = '24h' | '7d' | '30d' | 'all';
type StatusFilter = 'all' | 'candidate' | 'resolved' | 'stripped';

const DATE_RANGES: DateRange[] = ['24h', '7d', '30d', 'all'];
const STATUS_FILTERS: StatusFilter[] = ['all', 'candidate', 'resolved', 'stripped'];

// ── Main page ────────────────────────────────────────────────────────

export function PublisherPage() {
  const category = useUiStore((s) => s.category);
  const formatDate = useFormatDateTime();
  const tzLabel = useTimezoneLabel();

  // Filter state (persisted)
  const [page, setPage] = usePersistedNumber('publisher:page', 1);
  const limit = 100;
  const [dateRange, setDateRange] = usePersistedTab<DateRange>('publisher:dateRange', '7d');
  const [statusFilter, setStatusFilter] = usePersistedTab<StatusFilter>('publisher:statusFilter', 'all');
  const [fieldFilter, setFieldFilter] = usePersistedTab<string>('publisher:fieldFilter', '');
  const [searchText, setSearchText] = usePersistedTab<string>('publisher:searchText', '');

  const { data, isLoading } = useQuery<PublisherCandidatesResponse>({
    queryKey: ['publisher', category, page, limit],
    queryFn: () => api.get<PublisherCandidatesResponse>(`/publisher/${category}/candidates?page=${page}&limit=${limit}`),
    enabled: Boolean(category),
    refetchInterval: 10_000,
  });

  const stats: PublisherStats = data?.stats ?? { total: 0, resolved: 0, pending: 0, repaired: 0, products: 0, unknown_stripped: 0 };

  // Client-side filtering
  const filteredRows = useMemo(() => {
    let rows = data?.rows ?? [];

    if (dateRange !== 'all') {
      const now = Date.now();
      const ms = dateRange === '24h' ? 86_400_000 : dateRange === '7d' ? 604_800_000 : 2_592_000_000;
      rows = rows.filter((r) => parseBackendMs(r.submitted_at) > now - ms);
    }

    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    if (fieldFilter) {
      rows = rows.filter((r) => r.field_key === fieldFilter);
    }

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

  const fieldKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of data?.rows ?? []) keys.add(r.field_key);
    return Array.from(keys).sort();
  }, [data?.rows]);

  // ── Columns ──────────────────────────────────────────────────────

  const columns: ColumnDef<PublisherCandidateRow, unknown>[] = useMemo(() => [
    {
      id: 'expand',
      header: '',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}
          className="inline-flex items-center justify-center w-5 h-5 rounded-sm"
          style={{
            background: row.getIsExpanded() ? 'rgb(var(--sf-color-accent-rgb) / 0.12)' : 'transparent',
            color: row.getIsExpanded() ? 'var(--sf-token-accent-strong)' : 'rgb(var(--sf-color-text-subtle-rgb))',
            cursor: 'pointer',
            border: 'none',
            transform: row.getIsExpanded() ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s ease, color 0.15s ease',
          }}
          title={row.getIsExpanded() ? 'Collapse' : 'Expand'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ),
      size: 32,
    },
    {
      accessorKey: 'submitted_at',
      header: `Submitted (${tzLabel})`,
      cell: ({ getValue }) => (
        <span className="sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11 }}>
          {formatDate(getValue() as string) || '—'}
        </span>
      ),
      size: 120,
    },
    {
      accessorKey: 'brand',
      header: 'Brand',
      cell: ({ getValue }) => <span className="sf-text-primary" style={{ fontSize: 12 }}>{(getValue() as string) || '—'}</span>,
      size: 90,
    },
    {
      accessorKey: 'model',
      header: 'Model',
      cell: ({ getValue }) => (
        <span className="sf-text-primary" style={{ fontSize: 12 }}>
          {(getValue() as string) || '—'}
        </span>
      ),
      size: 150,
    },
    {
      accessorKey: 'product_id',
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="sf-text-subtle" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 10 }}>
          {getValue() as string}
        </span>
      ),
      size: 120,
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
      cell: ({ getValue }) => {
        const raw = getValue();
        const formatted = formatCellValue(raw);
        return (
          <span className="sf-text-muted" style={{ fontFamily: 'var(--sf-token-font-family-mono)', fontSize: 11, maxWidth: 260, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatted ? truncateValue(formatted) : '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as PublisherCandidateRow['status'];
        const cls = s === 'resolved'
          ? 'sf-chip-info'
          : s === 'stripped'
            ? 'sf-chip-warning'
            : 'sf-chip-success';
        return <Chip label={s} className={cls} />;
      },
      size: 82,
    },
    {
      id: 'unknown_stripped',
      header: 'Unk',
      cell: ({ row }) => {
        if (!row.original.unknown_stripped) return null;
        const us = unknownStatusLabel(row.original);
        return <span title={us.tip}><Chip label={us.label} className={us.cls} /></span>;
      },
      size: 56,
    },
    {
      id: 'published',
      header: 'Pub',
      cell: ({ row }) => {
        const ps = publishStatusLabel(row.original);
        return <span title={ps.tip}><Chip label={ps.label} className={ps.cls} /></span>;
      },
      size: 72,
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
      accessorKey: 'source_type',
      header: 'Source',
      cell: ({ getValue }) => {
        const st = (getValue() as string) || '';
        return <Chip label={st || '—'} className={st === 'cef' || st === 'key_finder' ? 'sf-chip-accent' : st === 'manual_override' ? 'sf-chip-warn' : 'sf-chip-info'} />;
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
    {
      id: 'evidence_accepted',
      header: 'Evid ✓',
      cell: ({ row }) => {
        const n = row.original.evidence_accepted_count ?? 0;
        return <Chip label={String(n)} className={n > 0 ? 'sf-chip-success' : 'sf-chip-neutral'} />;
      },
      size: 60,
    },
    {
      id: 'evidence_rejected',
      header: 'Evid ✗',
      cell: ({ row }) => {
        const n = row.original.evidence_rejected_count ?? 0;
        return <Chip label={String(n)} className={n > 0 ? 'sf-chip-danger' : 'sf-chip-neutral'} />;
      },
      size: 60,
    },
  ], [formatDate, tzLabel]);

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
      <div className="grid grid-cols-6 gap-3">
        <StatCard label="Total Audit Rows" value={stats.total} />
        <StatCard label="Resolved" value={stats.resolved} colorClass="sf-status-text-success" />
        <StatCard label="Pending" value={stats.pending} colorClass="sf-status-text-warning" />
        <StatCard label="Repairs Applied" value={stats.repaired} colorClass="sf-status-text-info" />
        <StatCard label="Stripped Unk" value={stats.unknown_stripped ?? 0} colorClass="sf-status-text-warning" />
        <StatCard label="Products" value={stats.products} colorClass="sf-text-muted" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 sf-surface-panel rounded border sf-border-default px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="sf-text-subtle uppercase font-semibold" style={{ fontSize: 10, letterSpacing: '0.06em' }}>Date</span>
          <div className="flex gap-1">
            {DATE_RANGES.map((r) => (
              <FilterChip key={r} label={r} active={dateRange === r} onClick={() => setDateRange(r)} />
            ))}
          </div>
        </div>

        <div className="w-px h-6 sf-border-default" style={{ background: 'var(--sf-token-border-default)' }} />

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
        <Spinner className="h-8 w-8 mx-auto mt-12" />
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
            Showing <strong className="sf-text-primary">{((page - 1) * limit) + 1}–{Math.min(page * limit, data?.total ?? 0)}</strong> of <strong className="sf-text-primary">{(data?.total ?? 0).toLocaleString()}</strong> audit rows
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
