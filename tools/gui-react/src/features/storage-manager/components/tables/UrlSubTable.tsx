import { useRunDetail } from '../../state/useRunDetail.ts';
import { DataTable } from '@/shared/ui/data-display/DataTable';
import { Spinner } from '@/shared/ui/feedback/Spinner';
import { AlertBanner } from '@/shared/ui/feedback/AlertBanner';
import { URL_TABLE_COLUMNS } from '../columns/urlTableColumns.tsx';
import { ArtifactList } from './ArtifactList.tsx';
import type { RunSourceEntry } from '../../types.ts';

interface UrlSubTableProps {
  runId: string;
}

export function UrlSubTable({ runId }: UrlSubTableProps) {
  const { data: detail, isLoading, error } = useRunDetail(runId);
  const sources: RunSourceEntry[] = detail?.sources ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 pl-2">
        <Spinner className="h-3 w-3" />
        <span className="text-xs sf-text-muted">Loading sources...</span>
      </div>
    );
  }

  if (error) {
    return <AlertBanner severity="warning" title="Failed to load run details" message={String(error)} />;
  }

  if (sources.length === 0) {
    return <div className="py-3 pl-2 text-xs sf-text-subtle">No source URLs in this run</div>;
  }

  return (
    <DataTable<RunSourceEntry>
      data={sources}
      columns={URL_TABLE_COLUMNS}
      maxHeight="max-h-[300px]"
      renderExpandedRow={(source) => <ArtifactList source={source} />}
    />
  );
}
