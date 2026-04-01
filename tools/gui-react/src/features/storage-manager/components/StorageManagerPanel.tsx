import { useMemo, useState, useCallback } from 'react';
import { useStorageRuns } from '../state/useStorageRuns.ts';
import { useDeleteRun, useBulkDeleteRuns, useDeleteUrl, usePurgeProductHistory } from '../state/useStorageActions.ts';
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

  const runsQuery = useStorageRuns(true, categoryScope);
  const runs = runsQuery.data?.runs ?? [];

  const products = useMemo(() => groupRunsByProduct(runs), [runs]);

  /* ── Delete state ───────────────────────────────────────── */
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const singleDelete = useDeleteRun();
  const bulkDelete = useBulkDeleteRuns();
  const urlDelete = useDeleteUrl();
  const historyPurge = usePurgeProductHistory();
  const isDeleting = singleDelete.isPending || bulkDelete.isPending;

  const handleDeleteRun = useCallback((runId: string) => setDeleteTarget([runId]), []);
  const handleBulkDelete = useCallback((runIds: string[]) => setDeleteTarget(runIds), []);
  const handleDeleteUrl = useCallback((url: string, productId: string, cat: string) => {
    if (confirm(`Delete URL "${url}" and all its artifacts?`)) {
      urlDelete.mutate({ url, productId, category: cat });
    }
  }, [urlDelete]);
  const handlePurgeHistory = useCallback((productId: string, cat: string) => {
    if (confirm(`Purge ALL run history for "${productId}"? This keeps the product identity but deletes all runs, artifacts, and extracted data.`)) {
      historyPurge.mutate({ productId, category: cat });
    }
  }, [historyPurge]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.length === 1) {
      singleDelete.mutate(deleteTarget[0], { onSuccess: () => setDeleteTarget(null) });
    } else {
      bulkDelete.mutate(deleteTarget, { onSuccess: () => setDeleteTarget(null) });
    }
  }, [deleteTarget, singleDelete, bulkDelete]);

  const hasError = Boolean(runsQuery.error);

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
        runs={runs}
        isLoading={runsQuery.isLoading}
      />

      <ProductTable
        products={products}
        isLoading={runsQuery.isLoading}
        onDeleteAll={handleBulkDelete}
        onDeleteRun={handleDeleteRun}
        isDeleting={isDeleting}
        onDeleteUrl={handleDeleteUrl}
        isDeletingUrl={urlDelete.isPending}
        onPurgeHistory={handlePurgeHistory}
        isPurgingHistory={historyPurge.isPending}
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
