import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../../shared/ui/data-display/DataTable.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { usd, compactNumber } from '../../../utils/formatting.ts';
import { resolveBillingCallType } from '../billingCallTypeRegistry.ts';
import { chartColor } from '../billingTransforms.ts';
import { useBillingEntriesQuery } from '../billingQueries.ts';
import type { BillingEntry, BillingFilterState } from '../billingTypes.ts';

const PAGE_SIZE = 10;

interface BillingEntryTableProps {
  filters: BillingFilterState;
  page: number;
  onPageChange: (page: number) => void;
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  } catch {
    return ts;
  }
}

export function BillingEntryTable({ filters, page, onPageChange }: BillingEntryTableProps) {
  const { data, isLoading } = useBillingEntriesQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    category: filters.category,
    model: filters.model,
    reason: filters.reason,
  });

  const columns: ColumnDef<BillingEntry, unknown>[] = useMemo(() => [
    {
      accessorKey: 'ts',
      header: 'Timestamp',
      size: 160,
      cell: ({ getValue }) => <span className="font-mono text-xs">{formatTs(getValue() as string)}</span>,
    },
    {
      accessorKey: 'model',
      header: 'Model',
      size: 160,
      cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span>,
    },
    {
      accessorKey: 'category',
      header: 'Category',
      size: 90,
    },
    {
      accessorKey: 'reason',
      header: 'Call Type',
      size: 130,
      cell: ({ getValue }) => {
        const reason = getValue() as string;
        const entry = resolveBillingCallType(reason);
        return (
          <span
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded"
            style={{ background: `${chartColor(entry.color)}20`, color: chartColor(entry.color) }}
          >
            {entry.label}
          </span>
        );
      },
    },
    {
      accessorKey: 'product_id',
      header: 'Product',
      size: 180,
    },
    {
      accessorKey: 'prompt_tokens',
      header: 'In Tokens',
      size: 90,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs sf-text-muted text-right block">
          {compactNumber(getValue() as number)}
        </span>
      ),
    },
    {
      accessorKey: 'completion_tokens',
      header: 'Out Tokens',
      size: 90,
      cell: ({ getValue }) => (
        <span className="font-mono text-xs sf-text-muted text-right block">
          {compactNumber(getValue() as number)}
        </span>
      ),
    },
    {
      accessorKey: 'cost_usd',
      header: 'Cost',
      size: 80,
      cell: ({ getValue }) => (
        <span className="font-mono font-semibold text-right block">
          {usd(getValue() as number, 4)}
        </span>
      ),
    },
  ], []);

  const totalEntries = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const entries = data?.entries ?? [];

  if (isLoading && entries.length === 0) return <Spinner className="h-8 w-8 mx-auto mt-8" />;

  return (
    <div className="sf-surface-card rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b sf-border-default flex items-center justify-between">
        <h3 className="text-sm font-bold">LLM Call Log</h3>
      </div>

      <DataTable
        data={entries}
        columns={columns}
        searchable={false}
        maxHeight="max-h-[480px]"
        persistKey="billing-entries"
      />

      <div className="px-5 py-2.5 flex items-center justify-between text-xs sf-text-muted border-t sf-border-default">
        <span>
          {totalEntries > 0
            ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalEntries)} of ${compactNumber(totalEntries)} entries`
            : 'No entries'}
        </span>
        <div className="flex gap-1">
          <button
            className="sf-filter-chip text-xs"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = page < 3 ? i : page - 2 + i;
            if (p >= totalPages) return null;
            return (
              <button
                key={p}
                className={p === page ? 'sf-filter-chip sf-filter-chip-active text-xs' : 'sf-filter-chip text-xs'}
                onClick={() => onPageChange(p)}
              >
                {p + 1}
              </button>
            );
          })}
          {totalPages > 5 && page < totalPages - 3 && (
            <>
              <span className="px-1">...</span>
              <button className="sf-filter-chip text-xs" onClick={() => onPageChange(totalPages - 1)}>
                {totalPages}
              </button>
            </>
          )}
          <button
            className="sf-filter-chip text-xs"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
