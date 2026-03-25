import type { ExtractionScreenshotData } from '../../types.ts';
import { StageEmptyState } from '../shared/StageEmptyState.tsx';

interface ExtractionScreenshotPanelProps {
  data: ExtractionScreenshotData;
  persistScope: string;
}

export function ExtractionScreenshotPanel({ data }: ExtractionScreenshotPanelProps) {
  if (!data.entries.length) {
    return (
      <StageEmptyState
        icon="&#x1F4F7;"
        heading="No Screenshots Yet"
        description="Screenshots will appear here once the extraction phase captures page data."
      />
    );
  }

  return (
    <div className="sf-surface-panel sf-border sf-radius-card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <span className="sf-text-heading-sm font-semibold">
          {data.total_screenshots} screenshot{data.total_screenshots !== 1 ? 's' : ''}
        </span>
        <span className="sf-text-secondary sf-text-nano">
          {(data.total_bytes / 1024).toFixed(0)} KB total
        </span>
      </div>
      <table className="w-full sf-text-body">
        <thead>
          <tr className="sf-text-secondary sf-text-nano uppercase tracking-wide">
            <th className="text-left py-1">URL</th>
            <th className="text-right py-1">Worker</th>
            <th className="text-right py-1">Count</th>
            <th className="text-right py-1">Formats</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((entry) => (
            <tr key={`${entry.worker_id}-${entry.url}`} className="sf-border-t">
              <td className="py-1.5 truncate max-w-[300px]" title={entry.url}>
                {entry.url}
              </td>
              <td className="text-right py-1.5 sf-text-secondary">{entry.worker_id}</td>
              <td className="text-right py-1.5">{entry.count}</td>
              <td className="text-right py-1.5 sf-text-secondary">{entry.formats.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
