import { useMemo } from 'react';
import { usePersistedNumber } from '../../../stores/tabStore.ts';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../../shared/ui/data-display/DataTable.tsx';
import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { useFormatDateTime } from '../../../utils/dateTime.ts';
import { resolveBillingCallType } from '../billingCallTypeRegistry.ts';
import { chartColor } from '../billingTransforms.ts';
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

interface EntryFlag {
  label: string;
  cls: string;
}

function parseFlags(entry: BillingEntry): EntryFlag[] {
  const flags: EntryFlag[] = [];
  const provider = entry.provider || '';
  const host = entry.host || '';

  if (provider.startsWith('lab-') || host.includes('localhost')) {
    flags.push({ label: 'LAB', cls: 'sf-chip-info' });
  } else {
    flags.push({ label: 'API', cls: 'sf-chip-neutral' });
  }

  const meta = parseMeta(entry.meta);

  if (meta.reasoning_mode || meta.deepseek_mode_detected) {
    flags.push({ label: 'THINK', cls: 'sf-chip-info-strong' });
  }

  return flags;
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
      accessorKey: 'ts',
      header: 'Timestamp',
      size: 170,
      cell: ({ getValue }) => <span className="font-mono text-[11px] whitespace-nowrap">{formatDateTime(getValue() as string)}</span>,
    },
    {
      accessorKey: 'provider',
      header: 'Provider',
      size: 80,
      cell: ({ getValue }) => <span className="text-[11px] sf-text-muted">{getValue() as string}</span>,
    },
    {
      accessorKey: 'model',
      header: 'Model',
      size: 150,
      cell: ({ getValue }) => <span className="font-mono text-[11px]">{getValue() as string}</span>,
    },
    {
      id: 'effort',
      header: 'Effort',
      size: 70,
      cell: ({ row }) => {
        const meta = parseMeta(row.original.meta);
        return <span className="text-[11px] sf-text-muted">{meta.effort_level || '\u2014'}</span>;
      },
    },
    {
      id: 'web',
      header: 'Web',
      size: 50,
      cell: ({ row }) => {
        const meta = parseMeta(row.original.meta);
        const host = row.original.host || '';
        // WHY: backward compat — old rows without explicit meta field fall back to host heuristic
        const webEnabled = meta.web_search_enabled ||
          (host !== '' && !host.includes('localhost') && !host.includes('api.'));
        return (
          <span className={`text-[11px] ${webEnabled ? 'sf-text-accent' : 'sf-text-muted'}`}>
            {webEnabled ? 'On' : 'Off'}
          </span>
        );
      },
    },
    {
      id: 'duration',
      header: 'Duration',
      size: 70,
      cell: ({ row }) => {
        const meta = parseMeta(row.original.meta);
        return <span className="font-mono text-[11px] sf-text-muted">{formatDuration(meta.duration_ms)}</span>;
      },
    },
    {
      accessorKey: 'category',
      header: 'Category',
      size: 80,
      cell: ({ getValue }) => <span className="text-[11px] capitalize">{getValue() as string}</span>,
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
      accessorKey: 'product_id',
      header: 'Product',
      size: 160,
      cell: ({ getValue }) => <span className="text-[11px] truncate block max-w-[160px]">{getValue() as string}</span>,
    },
    {
      accessorKey: 'prompt_tokens',
      header: 'In Tokens',
      size: 80,
      cell: ({ getValue }) => <span className="font-mono text-[11px] sf-text-muted">{formatTokens(getValue() as number)}</span>,
    },
    {
      accessorKey: 'completion_tokens',
      header: 'Out Tokens',
      size: 80,
      cell: ({ getValue }) => <span className="font-mono text-[11px] sf-text-muted">{formatTokens(getValue() as number)}</span>,
    },
    {
      accessorKey: 'cost_usd',
      header: 'Cost',
      size: 80,
      cell: ({ getValue }) => <span className="font-mono text-[11px] font-semibold">{usd(getValue() as number, 4)}</span>,
    },
    {
      id: 'flags',
      header: 'Flags',
      size: 100,
      cell: ({ row }) => {
        const flags = parseFlags(row.original);
        return (
          <div className="flex gap-0.5 flex-wrap">
            {flags.map((f) => (
              <span key={f.label} className={`sf-billing-flag ${f.cls}`}>{f.label}</span>
            ))}
          </div>
        );
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
