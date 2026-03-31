import { useMemo, useState, useCallback } from 'react';
import { useStorageOverview } from '../state/useStorageOverview.ts';
import { useStorageRuns } from '../state/useStorageRuns.ts';
import { useDeleteRun, useBulkDeleteRuns } from '../state/useStorageActions.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import { groupRunsByProduct } from '../helpers.ts';
import { StorageOverviewBar } from './StorageOverviewBar.tsx';
import { ProductTable } from './tables/ProductTable.tsx';
import { StorageOperationsBar } from './StorageOperationsBar.tsx';
import { DeleteConfirmModal } from './DeleteConfirmModal.tsx';
import { AlertBanner } from '@/shared/ui/feedback/AlertBanner';

export function StorageManagerPanel() {
  const category = useUiStore((s) => s.category);
  const categoryScope = category === 'all' ? undefined : category;

  const overview = useStorageOverview(true);
  const runsQuery = useStorageRuns(true, categoryScope);
  const runs = runsQuery.data?.runs ?? [];

  const products = useMemo(() => groupRunsByProduct(runs), [runs]);

  /* ── Delete state ───────────────────────────────────────── */
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const singleDelete = useDeleteRun();
  const bulkDelete = useBulkDeleteRuns();
  const isDeleting = singleDelete.isPending || bulkDelete.isPending;

  const handleDeleteRun = useCallback((runId: string) => setDeleteTarget([runId]), []);
  const handleBulkDelete = useCallback((runIds: string[]) => setDeleteTarget(runIds), []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.length === 1) {
      singleDelete.mutate(deleteTarget[0], { onSuccess: () => setDeleteTarget(null) });
    } else {
      bulkDelete.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
    }
  }, [deleteTarget, singleDelete, bulkDelete]);

  const hasError = overview.error || runsQuery.error;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      {hasError && (
        <AlertBanner
          severity="warning"
          title="Storage data unavailable"
          message="Could not load storage data. The server may not have storage routes enabled."
        />
      )}

      <StorageOverviewBar
        overview={overview.data}
        runs={runs}
        isLoading={overview.isLoading}
      />

      <ProductTable
        products={products}
        isLoading={runsQuery.isLoading}
        onDeleteAll={handleBulkDelete}
        onDeleteRun={handleDeleteRun}
        isDeleting={isDeleting}
      />

      <StorageOperationsBar totalRuns={runs.length} />

      {deleteTarget && (
        <DeleteConfirmModal
          runIds={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isPending={isDeleting}
        />
      )}
    </div>
  );
}
