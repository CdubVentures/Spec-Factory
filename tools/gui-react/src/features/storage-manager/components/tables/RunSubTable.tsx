import { useMemo } from 'react';
import { DataTable } from '@/shared/ui/data-display/DataTable';
import type { RunInventoryRow } from '../../types.ts';
import { buildRunColumns } from '../columns/runTableColumns.tsx';
import { UrlSubTable } from './UrlSubTable.tsx';

interface RunSubTableProps {
  runs: RunInventoryRow[];
  onDeleteRun: (runId: string) => void;
  isDeleting: boolean;
}

export function RunSubTable({ runs, onDeleteRun, isDeleting }: RunSubTableProps) {
  const columns = useMemo(
    () => buildRunColumns(onDeleteRun, isDeleting),
    [onDeleteRun, isDeleting],
  );

  return (
    <DataTable<RunInventoryRow>
      data={runs}
      columns={columns}
      maxHeight="max-h-[400px]"
      renderExpandedRow={(run) => <UrlSubTable runId={run.run_id} />}
    />
  );
}
