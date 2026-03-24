import { useState, useCallback } from 'react';
import { useStorageOverview } from '../state/useStorageOverview.ts';
import { useStorageRuns } from '../state/useStorageRuns.ts';
import { StorageOverviewBar } from './StorageOverviewBar.tsx';
import { RunInventoryTable } from './RunInventoryTable.tsx';
import { StorageOperationsBar } from './StorageOperationsBar.tsx';
import { AlertBanner } from '@/shared/ui/feedback/AlertBanner';

export function StorageManagerPanel() {
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());

  const overview = useStorageOverview(true);
  const runsQuery = useStorageRuns(true);
  const runs = runsQuery.data?.runs ?? [];

  const handleToggleSelect = useCallback((runId: string) => {
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedRunIds(new Set(runs.map((r) => r.run_id)));
  }, [runs]);

  const handleClearSelection = useCallback(() => {
    setSelectedRunIds(new Set());
  }, []);

  const hasError = overview.error || runsQuery.error;

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold">Storage Manager</h2>

      {hasError && (
        <AlertBanner
          severity="warning"
          title="Storage data unavailable"
          message="Could not load storage data. The server may not have storage routes enabled."
        />
      )}

      <StorageOverviewBar
        overview={overview.data}
        isLoading={overview.isLoading}
      />

      <RunInventoryTable
        runs={runs}
        isLoading={runsQuery.isLoading}
        selectedRunIds={selectedRunIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
      />

      <StorageOperationsBar
        selectedRunIds={selectedRunIds}
        totalRuns={runs.length}
        onClearSelection={handleClearSelection}
      />
    </div>
  );
}
