import { useMemo, useState, useCallback } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/data-display/DataTable';
import { TrafficLight } from '@/shared/ui/feedback/TrafficLight';
import { Chip } from '@/shared/ui/feedback/Chip';
import type { RunInventoryRow } from '../types';
import { RunDetailDrawer } from './RunDetailDrawer';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatDuration(startedAt: string, endedAt: string): string {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function statusColor(status: string): string {
  if (status === 'completed') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'running') return 'yellow';
  return 'gray';
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface RunInventoryTableProps {
  runs: RunInventoryRow[];
  isLoading: boolean;
  selectedRunIds: Set<string>;
  onToggleSelect: (runId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function RunInventoryTable({
  runs,
  isLoading,
  selectedRunIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}: RunInventoryTableProps) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const handleRowClick = useCallback((row: RunInventoryRow) => {
    setExpandedRunId((prev) => (prev === row.run_id ? null : row.run_id));
  }, []);

  const columns = useMemo<ColumnDef<RunInventoryRow, unknown>[]>(() => [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={runs.length > 0 && selectedRunIds.size === runs.length}
          onChange={() => {
            if (selectedRunIds.size === runs.length) onClearSelection();
            else onSelectAll();
          }}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedRunIds.has(row.original.run_id)}
          onChange={(e) => {
            e.stopPropagation();
            onToggleSelect(row.original.run_id);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      size: 32,
      enableSorting: false,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <TrafficLight color={statusColor(row.original.status)} />,
      size: 60,
    },
    {
      accessorKey: 'run_id',
      header: 'Run ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.run_id}</span>
      ),
      size: 180,
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => <Chip label={row.original.category} className="sf-chip-neutral" />,
      size: 100,
    },
    {
      accessorKey: 'product_id',
      header: 'Product',
      cell: ({ row }) => (
        <span className="text-xs truncate max-w-[160px]" title={row.original.product_id}>
          {row.original.picker_label ?? row.original.product_id}
        </span>
      ),
      size: 160,
    },
    {
      id: 'pages',
      header: 'Pages',
      accessorFn: (row) => row.counters?.pages_checked ?? 0,
      size: 60,
    },
    {
      id: 'fetched',
      header: 'Fetched',
      accessorFn: (row) => row.counters?.fetched_ok ?? 0,
      size: 70,
    },
    {
      id: 'parsed',
      header: 'Parsed',
      accessorFn: (row) => row.counters?.parse_completed ?? 0,
      size: 70,
    },
    {
      id: 'indexed',
      header: 'Indexed',
      accessorFn: (row) => row.counters?.indexed_docs ?? 0,
      size: 70,
    },
    {
      id: 'fields',
      header: 'Fields',
      accessorFn: (row) => row.counters?.fields_filled ?? 0,
      size: 60,
    },
    {
      id: 'duration',
      header: 'Duration',
      accessorFn: (row) => {
        const ms = new Date(row.ended_at).getTime() - new Date(row.started_at).getTime();
        return Number.isFinite(ms) ? ms : 0;
      },
      cell: ({ row }) => formatDuration(row.original.started_at, row.original.ended_at),
      size: 80,
    },
    {
      id: 'size',
      header: 'Size',
      accessorFn: (row) => row.storage_metrics?.total_size_bytes ?? 0,
      cell: ({ row }) => {
        const bytes = row.original.storage_metrics?.total_size_bytes;
        return bytes != null ? formatBytes(bytes) : <span className="sf-text-muted">--</span>;
      },
      size: 80,
    },
    {
      id: 'date',
      header: 'Date',
      accessorFn: (row) => row.started_at,
      cell: ({ row }) => (
        <span title={row.original.started_at}>
          {formatRelativeDate(row.original.started_at)}
        </span>
      ),
      size: 80,
    },
    {
      id: 'origin',
      header: 'Origin',
      accessorFn: (row) => row.storage_origin ?? 'local',
      cell: ({ row }) => (
        <Chip
          label={row.original.storage_origin ?? 'local'}
          className={row.original.storage_origin === 's3' ? 'sf-chip-accent' : 'sf-chip-neutral'}
        />
      ),
      size: 70,
    },
  ], [runs.length, selectedRunIds, onToggleSelect, onSelectAll, onClearSelection]);

  if (isLoading) {
    return <div className="text-sm sf-text-muted py-4">Loading runs...</div>;
  }

  if (runs.length === 0) {
    return <div className="text-sm sf-text-muted py-4">No runs found in storage.</div>;
  }

  return (
    <DataTable
      data={runs}
      columns={columns}
      searchable
      persistKey="storage-manager-runs"
      maxHeight="480px"
      onRowClick={handleRowClick}
      renderExpandedRow={(row) =>
        expandedRunId === row.run_id ? <RunDetailDrawer runId={row.run_id} /> : null
      }
      getCanExpand={() => true}
    />
  );
}
