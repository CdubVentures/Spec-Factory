import { useState } from 'react';
import { Spinner } from '@/shared/ui/feedback/Spinner';
import { AlertBanner } from '@/shared/ui/feedback/AlertBanner';
import {
  useDeleteRun,
  usePruneRuns,
  usePurgeRuns,
  useRecalculateMetrics,
} from '../state/useStorageActions.ts';
import { DeleteConfirmModal } from './DeleteConfirmModal.tsx';
import { PurgeConfirmModal } from './PurgeConfirmModal.tsx';

interface StorageOperationsBarProps {
  selectedRunIds: Set<string>;
  totalRuns: number;
  onClearSelection: () => void;
}

export function StorageOperationsBar({
  selectedRunIds,
  totalRuns,
  onClearSelection,
}: StorageOperationsBarProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [pruneDays, setPruneDays] = useState(30);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const deleteRun = useDeleteRun();
  const pruneRuns = usePruneRuns();
  const purgeRuns = usePurgeRuns();
  const recalculate = useRecalculateMetrics();

  const selectedIds = [...selectedRunIds];

  function showResult(msg: string) {
    setResultMessage(msg);
    setTimeout(() => setResultMessage(null), 6000);
  }

  const handleDeleteConfirm = () => {
    const doDelete = async () => {
      for (const id of selectedIds) {
        await deleteRun.mutateAsync(id);
      }
      onClearSelection();
      setShowDeleteModal(false);
      showResult(`Deleted ${selectedIds.length} run(s).`);
    };
    doDelete();
  };

  const handlePrune = () => {
    pruneRuns.mutate({ olderThanDays: pruneDays }, {
      onSuccess: (data) => showResult(`Pruned ${data.pruned} runs older than ${pruneDays} days.`),
    });
  };

  const handlePruneFailed = () => {
    pruneRuns.mutate({ olderThanDays: 0, failedOnly: true }, {
      onSuccess: (data) => showResult(`Pruned ${data.pruned} failed runs.`),
    });
  };

  const handlePurge = () => {
    purgeRuns.mutate(undefined, {
      onSuccess: (data) => {
        setShowPurgeModal(false);
        onClearSelection();
        showResult(`Purged ${data.purged} runs.`);
      },
    });
  };

  const handleRecalculate = () => {
    recalculate.mutate(undefined, {
      onSuccess: (data) => {
        showResult(
          `Scanned ${data.runs_scanned}, updated ${data.runs_updated}. Total: ${Math.round(data.total_size_bytes / 1024)} KB.`
        );
      },
    });
  };

  const handleExport = () => {
    window.open('/api/v1/storage/export', '_blank');
  };

  const anyPending = deleteRun.isPending || pruneRuns.isPending || purgeRuns.isPending || recalculate.isPending;

  return (
    <div className="space-y-2 pt-3 border-t sf-border-soft">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded bg-red-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
          disabled={selectedRunIds.size === 0 || anyPending}
          onClick={() => setShowDeleteModal(true)}
        >
          Delete Selected ({selectedRunIds.size})
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded sf-icon-button px-3 py-1.5 text-xs"
            disabled={anyPending}
            onClick={handlePrune}
          >
            {pruneRuns.isPending ? <Spinner className="h-3 w-3" /> : 'Prune'}
          </button>
          <span className="text-xs sf-text-muted">older than</span>
          <input
            type="number"
            min={1}
            max={9999}
            value={pruneDays}
            onChange={(e) => setPruneDays(Math.max(1, Number(e.target.value) || 30))}
            className="w-14 rounded sf-input px-2 py-1 text-xs text-center"
          />
          <span className="text-xs sf-text-muted">days</span>
        </div>

        <button
          type="button"
          className="rounded sf-icon-button px-3 py-1.5 text-xs text-red-500"
          disabled={anyPending}
          onClick={handlePruneFailed}
        >
          Prune Failed
        </button>

        <button
          type="button"
          className="rounded sf-icon-button px-3 py-1.5 text-xs text-red-500"
          disabled={totalRuns === 0 || anyPending}
          onClick={() => setShowPurgeModal(true)}
        >
          Purge All
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded sf-icon-button px-3 py-1.5 text-xs"
            disabled={anyPending}
            onClick={handleRecalculate}
          >
            {recalculate.isPending ? <Spinner className="h-3 w-3" /> : 'Recalculate Sizes'}
          </button>
          <button
            type="button"
            className="rounded sf-icon-button px-3 py-1.5 text-xs"
            onClick={handleExport}
          >
            Export Inventory
          </button>
        </div>
      </div>

      {resultMessage && (
        <AlertBanner severity="info" title="Storage operation" message={resultMessage} onDismiss={() => setResultMessage(null)} />
      )}

      {showDeleteModal && (
        <DeleteConfirmModal
          runIds={selectedIds}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteModal(false)}
          isPending={deleteRun.isPending}
        />
      )}

      {showPurgeModal && (
        <PurgeConfirmModal
          totalRuns={totalRuns}
          onConfirm={handlePurge}
          onCancel={() => setShowPurgeModal(false)}
          isPending={purgeRuns.isPending}
        />
      )}
    </div>
  );
}
