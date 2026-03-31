import type { ColumnDef } from '@tanstack/react-table';
import { Chip } from '@/shared/ui/feedback/Chip';
import type { RunInventoryRow } from '../../types.ts';
import { formatBytes, formatDuration, formatRelativeDate, runSizeBytes } from '../../helpers.ts';

const STATUS_CHIP_CLASS: Record<string, string> = {
  completed: 'sf-chip-success',
  failed: 'sf-chip-danger',
  running: 'sf-chip-warning',
};

export function buildRunColumns(
  onDeleteRun: (runId: string) => void,
  isDeleting: boolean,
): ColumnDef<RunInventoryRow, unknown>[] {
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
          aria-label={`Expand run ${row.original.run_id}`}
          className="text-[10px] sf-text-subtle transition-transform"
          style={{ transform: row.getIsExpanded() ? 'rotate(90deg)' : undefined }}
        >
          &#9654;
        </button>
      ),
      enableSorting: false,
    },
    {
      id: 'run_id',
      header: 'Run ID',
      accessorKey: 'run_id',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs sf-text-primary truncate" title={String(getValue())}>
          {String(getValue())}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessorKey: 'status',
      size: 90,
      cell: ({ getValue }) => {
        const status = String(getValue());
        const cls = STATUS_CHIP_CLASS[status] ?? 'sf-chip-neutral';
        return <Chip label={status} className={cls} />;
      },
    },
    {
      id: 'size',
      header: 'Size',
      accessorFn: (row) => runSizeBytes(row),
      size: 80,
      cell: ({ getValue }) => (
        <span className="block text-right font-mono sf-text-muted">
          {formatBytes(getValue() as number)}
        </span>
      ),
    },
    {
      id: 'date',
      header: 'Date',
      accessorKey: 'started_at',
      size: 80,
      cell: ({ getValue }) => (
        <span className="block text-right sf-text-muted" title={String(getValue())}>
          {formatRelativeDate(String(getValue()))}
        </span>
      ),
    },
    {
      id: 'duration',
      header: 'Duration',
      size: 70,
      accessorFn: (row) => new Date(row.ended_at).getTime() - new Date(row.started_at).getTime(),
      cell: ({ row }) => (
        <span className="block text-right sf-text-muted">
          {formatDuration(row.original.started_at, row.original.ended_at)}
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
          onClick={(e) => { e.stopPropagation(); onDeleteRun(row.original.run_id); }}
          disabled={isDeleting}
          className="text-[10px] font-semibold sf-status-text-danger hover:underline disabled:opacity-50"
          aria-label={`Delete run ${row.original.run_id}`}
        >
          Delete
        </button>
      ),
    },
  ];
}
