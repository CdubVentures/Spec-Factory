import type { ColumnDef } from '@tanstack/react-table';
import type { ProductGroup } from '../../helpers.ts';
import { formatBytes } from '../../helpers.ts';

export function buildProductColumns(
  onDeleteAll: (runIds: string[]) => void,
  isDeleting: boolean,
): ColumnDef<ProductGroup, unknown>[] {
  return [
    {
      id: 'expander',
      size: 40,
      header: '',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}
          aria-expanded={row.getIsExpanded()}
          aria-label={`Expand ${row.original.key}`}
          className="text-[10px] sf-text-subtle transition-transform"
          style={{ transform: row.getIsExpanded() ? 'rotate(90deg)' : undefined }}
        >
          &#9654;
        </button>
      ),
      enableSorting: false,
    },
    {
      id: 'product',
      header: 'Product',
      accessorFn: (row) => row.key,
      cell: ({ row }) => (
        <span className="font-semibold sf-text-primary truncate block" title={row.original.key}>
          {row.original.key}
        </span>
      ),
    },
    {
      id: 'runs',
      header: 'Runs',
      accessorFn: (row) => row.runs.length,
      size: 70,
      cell: ({ getValue }) => (
        <span className="block text-right sf-text-muted">{String(getValue())}</span>
      ),
    },
    {
      id: 'size',
      header: 'Size',
      accessorFn: (row) => row.totalSize,
      size: 100,
      cell: ({ getValue }) => (
        <span className="block text-right font-mono sf-text-primary">
          {formatBytes(getValue() as number)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      enableSorting: false,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDeleteAll(row.original.runs.map((r) => r.run_id)); }}
          disabled={isDeleting}
          className="text-[10px] font-semibold sf-status-text-danger hover:underline disabled:opacity-50"
          aria-label={`Delete all runs for ${row.original.key}`}
        >
          Delete
        </button>
      ),
    },
  ];
}
