import type { ColumnDef } from '@tanstack/react-table';
import type { RunSourceEntry } from '../../types.ts';

function httpStatusClass(status: number, blocked: boolean): string {
  if (blocked) return 'sf-status-text-warning';
  if (status >= 200 && status < 400) return 'sf-status-text-success';
  return 'sf-status-text-danger';
}

export const URL_TABLE_COLUMNS: ColumnDef<RunSourceEntry, unknown>[] = [
  {
    id: 'expander',
    size: 40,
    header: '',
    cell: ({ row }) => (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}
        aria-expanded={row.getIsExpanded()}
        aria-label={`Expand URL ${row.original.url}`}
        className="text-[10px] sf-text-subtle transition-transform"
        style={{ transform: row.getIsExpanded() ? 'rotate(90deg)' : undefined }}
      >
        &#9654;
      </button>
    ),
    enableSorting: false,
  },
  {
    id: 'url',
    header: 'URL',
    accessorKey: 'url',
    cell: ({ getValue }) => (
      <span className="font-mono text-[11px] sf-text-primary truncate block" title={String(getValue())}>
        {String(getValue())}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    size: 70,
    cell: ({ row }) => (
      <span className={`font-mono text-xs ${httpStatusClass(row.original.status, row.original.blocked)}`}>
        {row.original.status}
      </span>
    ),
  },
  {
    id: 'hash',
    header: 'Hash',
    accessorKey: 'content_hash',
    size: 90,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs sf-text-muted">
        {(getValue() as string)?.slice(0, 8) || '\u2014'}
      </span>
    ),
  },
];
