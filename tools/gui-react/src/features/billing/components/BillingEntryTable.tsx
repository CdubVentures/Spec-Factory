import { useMemo } from 'react';
import { usePersistedNumber } from '../../../stores/tabStore.ts';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../../shared/ui/data-display/DataTable.tsx';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { useFormatDateTime } from '../../../utils/dateTime.ts';
import { resolveBillingCallType } from '../billingCallTypeRegistry.generated.ts';
import { chartColor, computeTokenSegments } from '../billingTransforms.ts';
import { useBillingEntriesQuery } from '../billingQueries.ts';
import type { BillingEntry, BillingFilterState } from '../billingTypes.ts';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface BillingEntryTableProps {
  filters: BillingFilterState;
  page: number;
  onPageChange: (page: number) => void;
}

function formatTokens(value: number): string {
  if (!value) return '\u2014';
  return value.toLocaleString();
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface ParsedBillingMeta {
  effort_level: string;
  web_search_enabled: boolean;
  duration_ms: number;
  reasoning_mode: boolean;
  deepseek_mode_detected: boolean;
}

function parseMeta(raw: string): ParsedBillingMeta {
  try {
    const m: Record<string, unknown> = raw ? JSON.parse(raw) : {};
    return {
      effort_level: String(m.effort_level || ''),
      web_search_enabled: Boolean(m.web_search_enabled),
      duration_ms: Number(m.duration_ms) || 0,
      reasoning_mode: Boolean(m.reasoning_mode),
      deepseek_mode_detected: Boolean(m.deepseek_mode_detected),
    };
  } catch {
    return { effort_level: '', web_search_enabled: false, duration_ms: 0, reasoning_mode: false, deepseek_mode_detected: false };
  }
}

type AccessKind = 'lab' | 'api';

function deriveAccess(entry: BillingEntry): AccessKind {
  const provider = entry.provider || '';
  const host = entry.host || '';
  if (provider.startsWith('lab-') || host.includes('localhost')) return 'lab';
  return 'api';
}

type StatusKind = 'ok' | 'warn' | 'err';

function deriveStatus(entry: BillingEntry, meta: ParsedBillingMeta): StatusKind {
  // WHY: ledger doesn't store a hard error flag today — use retry_without_schema
  // as a soft warn signal; estimated_usage as stronger warn. Upgrade once we
  // persist an explicit error column.
  if (entry.estimated_usage) return 'warn';
  if (meta.reasoning_mode === false && meta.effort_level === '' && entry.completion_tokens === 0 && entry.prompt_tokens > 0) {
    return 'err'; // call went out but produced no output — likely failed
  }
  return 'ok';
}

function costBucket(cost: number): '' | 'mid' | 'high' {
  if (cost >= 0.05) return 'high';
  if (cost >= 0.01) return 'mid';
  return '';
}

export function BillingEntryTable({ filters, page, onPageChange }: BillingEntryTableProps) {
  const [pageSize, setPageSize] = usePersistedNumber('billing:pageSize', 20);
  const formatDateTime = useFormatDateTime();
  const { data, isLoading, isPlaceholderData } = useBillingEntriesQuery({
    limit: pageSize,
    offset: page * pageSize,
    category: filters.category,
    model: filters.model,
    reason: filters.reason,
    access: filters.access,
  });

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    onPageChange(0);
  };

  const columns: ColumnDef<BillingEntry, unknown>[] = useMemo(() => [
    {
      id: 'status',
      header: '',
      size: 24,
      cell: ({ row }) => {
        const meta = parseMeta(row.original.meta);
        const s = deriveStatus(row.original, meta);
        return <span className={`sf-status-dot sf-status-dot-${s}`} aria-label={s} />;
      },
    },
    {
      accessorKey: 'ts',
      header: 'Timestamp',
      size: 150,
      cell: ({ getValue }) => <span className="font-mono text-[11px] whitespace-nowrap sf-text-subtle">{formatDateTime(getValue() as string)}</span>,
    },
    {
      accessorKey: 'product_id',
      header: 'Product',
      size: 170,
      cell: ({ getValue }) => <span className="text-[11px] truncate block max-w-[170px]">{getValue() as string}</span>,
    },
    {
      accessorKey: 'reason',
      header: 'Call Type',
      size: 120,
      cell: ({ getValue }) => {
        const reason = getValue() as string;
        const entry = resolveBillingCallType(reason);
        return (
          <span
            className="sf-billing-tag"
            style={{ background: `${chartColor(entry.color)}18`, color: chartColor(entry.color) }}
          >
            {entry.label}
          </span>
        );
      },
    },
    {
      accessorKey: 'model',
      header: 'Model',
      size: 150,
      cell: ({ row }) => {
        const meta = parseMeta(row.original.meta);
        const showThink = meta.reasoning_mode || meta.deepseek_mode_detected;
        return (
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[11px]">{row.original.model}</span>
            {showThink ? <span className="sf-billing-flag sf-chip-info-strong">THINK</span> : null}
          </span>
        );
      },
    },
    {
      id: 'access',
      header: 'Access',
      size: 65,
      cell: ({ row }) => {
        const a = deriveAccess(row.original);
        return <span className={`sf-access-tag sf-access-tag-${a}`}>{a === 'lab' ? 'Lab' : 'API'}</span>;
      },
    },
    {
      accessorKey: 'sent_tokens',
      header: 'Prompt',
      size: 75,
      cell: ({ getValue }) => <span className="font-mono text-[11px] sf-tok-prompt-text">{formatTokens(getValue() as number)}</span>,
    },
    {
      id: 'usage_tokens',
      header: 'Usage',
      size: 75,
      cell: ({ row }) => {
        // WHY: Derived — tool-loop / reasoning overhead = prompt_tokens - sent_tokens.
        // Clamped at 0 so historical rows (where sent_tokens was backfilled to equal
        // prompt_tokens) show 0 usage rather than a negative number.
        const usage = Math.max(0, (row.original.prompt_tokens || 0) - (row.original.sent_tokens || 0));
        return <span className="font-mono text-[11px] sf-tok-usage-text">{formatTokens(usage)}</span>;
      },
    },
    {
      accessorKey: 'prompt_tokens',
      header: 'Input',
      size: 75,
      cell: ({ getValue }) => <span className="font-mono text-[11px] sf-text-primary">{formatTokens(getValue() as number)}</span>,
    },
    {
      accessorKey: 'completion_tokens',
      header: 'Output',
      size: 90,
      cell: ({ getValue }) => <span className="font-mono text-[11px] sf-tok-completion-text">{formatTokens(getValue() as number)}</span>,
    },
    {
      accessorKey: 'cached_prompt_tokens',
      header: 'Cached',
      size: 75,
      cell: ({ getValue }) => <span className="font-mono text-[11px] sf-tok-cached-text">{formatTokens(getValue() as number)}</span>,
    },
    {
      id: 'tokmix',
      header: 'Mix',
      size: 80,
      cell: ({ row }) => {
        const seg = computeTokenSegments(row.original);
        if (seg.promptPct + seg.usagePct + seg.completionPct + seg.cachedPct === 0) {
          return <span className="sf-text-subtle text-[11px]">—</span>;
        }
        return (
          <span className="sf-tok-composition">
            <span className="sf-tok-composition-p" style={{ width: `${seg.promptPct}%` }} />
            <span className="sf-tok-composition-u" style={{ width: `${seg.usagePct}%` }} />
            <span className="sf-tok-composition-c" style={{ width: `${seg.completionPct}%` }} />
            <span className="sf-tok-composition-ca" style={{ width: `${seg.cachedPct}%` }} />
          </span>
        );
      },
    },
    {
      id: 'duration',
      header: 'Time',
      size: 65,
      cell: ({ row }) => {
        const meta = parseMeta(row.original.meta);
        return <span className="font-mono text-[11px] sf-text-muted">{formatDuration(meta.duration_ms)}</span>;
      },
    },
    {
      accessorKey: 'cost_usd',
      header: 'Cost',
      size: 80,
      cell: ({ getValue }) => {
        const cost = getValue() as number;
        const bucket = costBucket(cost);
        return <span className={`font-mono text-[11px] font-semibold sf-cost${bucket ? `-${bucket}` : ''}`}>{usd(cost, 4)}</span>;
      },
    },
  ], [formatDateTime]);

  const totalEntries = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const entries = data?.entries ?? [];
  const initialLoad = isLoading && entries.length === 0;
  const staleClass = isPlaceholderData ? ' sf-stale-refetch' : '';

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden flex flex-col sf-billing-min-table">
      {/* Stable header — never remounts */}
      <div className="px-5 py-3 border-b sf-border-default flex items-center justify-between">
        <h3 className="text-sm font-bold">LLM Call Log</h3>
        <div className="flex items-center gap-1">
          <span className="text-[11px] sf-text-muted">Show</span>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              className={size === pageSize ? 'sf-pager-btn sf-pager-btn-active' : 'sf-pager-btn'}
              onClick={() => handlePageSizeChange(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Content zone — skeleton or real table */}
      {initialLoad ? (
        <div className="p-5 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} className="sf-skel-row" />
          ))}
        </div>
      ) : (
        <div className={staleClass || 'sf-fade-in'}>
          <DataTable
            data={entries}
            columns={columns}
            searchable={false}
            persistKey="billing-entries"
          />
        </div>
      )}

      {/* Stable pagination footer — always present */}
      <div className="px-4 py-2 flex items-center justify-between text-[11px] sf-text-muted border-t sf-border-default">
        <span>
          {totalEntries > 0
            ? `Showing ${page * pageSize + 1}\u2013${Math.min((page + 1) * pageSize, totalEntries)} of ${compactNumber(totalEntries)} entries`
            : 'No entries'}
        </span>
        <div className="flex gap-0.5">
          <button className="sf-pager-btn" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
            &larr; Prev
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = page < 3 ? i : page - 2 + i;
            if (p >= totalPages) return null;
            return (
              <button
                key={p}
                className={p === page ? 'sf-pager-btn sf-pager-btn-active' : 'sf-pager-btn'}
                onClick={() => onPageChange(p)}
              >
                {p + 1}
              </button>
            );
          })}
          {totalPages > 5 && page < totalPages - 3 && (
            <>
              <span className="px-1">...</span>
              <button className="sf-pager-btn" onClick={() => onPageChange(totalPages - 1)}>
                {totalPages}
              </button>
            </>
          )}
          <button className="sf-pager-btn" disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>
            Next &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
