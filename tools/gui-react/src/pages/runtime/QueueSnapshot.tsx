import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { useUiStore } from '../../stores/uiStore.ts';
import { DataTable } from '../../components/common/DataTable.tsx';
import { StatusBadge } from '../../components/common/StatusBadge.tsx';
import { relativeTime } from '../../utils/formatting.ts';
import type { QueueProduct } from '../../types/product.ts';
import type { ColumnDef } from '@tanstack/react-table';

const columns: ColumnDef<QueueProduct, unknown>[] = [
  { accessorKey: 'productId', header: 'Product', size: 200 },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
    size: 100,
  },
  { accessorKey: 'priority', header: 'Priority', size: 70 },
  { accessorKey: 'attempts', header: 'Attempts', size: 70 },
  {
    accessorKey: 'updated_at',
    header: 'Updated',
    cell: ({ getValue }) => relativeTime(getValue() as string),
    size: 100,
  },
];

interface QueueSnapshotProps {
  products: QueueProduct[];
}

export function QueueSnapshot({ products }: QueueSnapshotProps) {
  const category = useUiStore((s) => s.category);
  const queryClient = useQueryClient();
  const [selectedPid, setSelectedPid] = useState('');
  const [priorityInput, setPriorityInput] = useState('3');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['queue', category] });

  const retryMut = useMutation({
    mutationFn: (productId: string) => api.post(`/queue/${category}/retry`, { productId }),
    onSuccess: invalidate,
  });

  const pauseMut = useMutation({
    mutationFn: (productId: string) => api.post(`/queue/${category}/pause`, { productId }),
    onSuccess: invalidate,
  });

  const priorityMut = useMutation({
    mutationFn: ({ productId, priority }: { productId: string; priority: number }) =>
      api.post(`/queue/${category}/priority`, { productId, priority }),
    onSuccess: invalidate,
  });

  const requeueMut = useMutation({
    mutationFn: () => api.post(`/queue/${category}/requeue-exhausted`),
    onSuccess: invalidate,
  });

  const busy = retryMut.isPending || pauseMut.isPending || priorityMut.isPending || requeueMut.isPending;
  const exhaustedCount = products.filter((p) => p.status === 'exhausted' || p.status === 'failed').length;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Queue Snapshot ({products.length})</h3>

      {/* Queue action bar */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <select
          value={selectedPid}
          onChange={(e) => setSelectedPid(e.target.value)}
          className="sf-select w-auto max-w-[220px] px-2 py-1 text-xs"
        >
          <option value="">-- select product --</option>
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.productId} ({p.status})
            </option>
          ))}
        </select>

        <button
          onClick={() => selectedPid && retryMut.mutate(selectedPid)}
          disabled={!selectedPid || busy}
          className="px-2 py-1 text-xs sf-primary-button disabled:opacity-40"
          title="Reset to queued with 0 attempts"
        >
          Retry
        </button>

        <button
          onClick={() => selectedPid && pauseMut.mutate(selectedPid)}
          disabled={!selectedPid || busy}
          className="px-2 py-1 text-xs sf-warning-button-solid disabled:opacity-40"
          title="Pause this product"
        >
          Pause
        </button>

        <div className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={5}
            value={priorityInput}
            onChange={(e) => setPriorityInput(e.target.value)}
            className="w-12 sf-input px-1 py-1 text-xs"
          />
          <button
            onClick={() => selectedPid && priorityMut.mutate({ productId: selectedPid, priority: parseInt(priorityInput, 10) || 3 })}
            disabled={!selectedPid || busy}
            className="px-2 py-1 text-xs sf-run-ai-button disabled:opacity-40"
            title="Set priority (1=highest, 5=lowest)"
          >
            Set Priority
          </button>
        </div>

        <div className="ml-auto">
          <button
            onClick={() => {
              if (exhaustedCount === 0) return;
              if (!confirm(`Requeue ${exhaustedCount} exhausted/failed products?`)) return;
              requeueMut.mutate();
            }}
            disabled={exhaustedCount === 0 || busy}
            className="px-2 py-1 text-xs sf-danger-button-solid disabled:opacity-40"
            title={`Requeue all exhausted/failed products (${exhaustedCount})`}
          >
            Requeue Exhausted ({exhaustedCount})
          </button>
        </div>
      </div>

      {/* Status feedback */}
      {(retryMut.isSuccess || pauseMut.isSuccess || priorityMut.isSuccess || requeueMut.isSuccess) && (
        <div className="text-xs sf-status-text-success mb-1">Action completed</div>
      )}
      {(retryMut.isError || pauseMut.isError || priorityMut.isError || requeueMut.isError) && (
        <div className="text-xs sf-status-text-danger mb-1">Action failed</div>
      )}

      <DataTable data={products} columns={columns} maxHeight="max-h-60" />
    </div>
  );
}
