import { useState } from 'react';
import { useRunDetail } from '../state/useRunDetail.ts';
import { Spinner } from '@/shared/ui/feedback/Spinner';
import { AlertBanner } from '@/shared/ui/feedback/AlertBanner';
import type { RunSourceEntry } from '../types.ts';
import { formatBytes } from '../helpers.ts';
import { ArtifactRow } from './ArtifactRow.tsx';

function httpStatusClass(status: number, blocked: boolean): string {
  if (blocked) return 'sf-status-text-warning';
  if (status >= 200 && status < 400) return 'sf-status-text-success';
  return 'sf-status-text-danger';
}

interface SourceListProps {
  runId: string;
}

export function SourceList({ runId }: SourceListProps) {
  const { data: detail, isLoading, error } = useRunDetail(runId);
  const sources: RunSourceEntry[] = detail?.sources ?? [];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (url: string) => setExpanded((prev) => ({ ...prev, [url]: !prev[url] }));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 pl-8">
        <Spinner className="h-3 w-3" />
        <span className="text-xs sf-text-muted">Loading sources...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pl-8 pr-3 py-2">
        <AlertBanner severity="warning" title="Failed to load run details" message={String(error)} />
      </div>
    );
  }

  if (sources.length === 0) {
    return <div className="py-3 pl-8 text-xs sf-text-subtle">No source URLs in this run</div>;
  }

  return (
    <div className="border-l-2 sf-border-soft ml-8 space-y-px">
      {sources.map((source) => {
        const hasArtifacts = Boolean(source.html_file || source.video_file || source.screenshot_count > 0);
        const isOpen = expanded[source.url] ?? false;
        return (
          <div key={source.url} className="border-b sf-border-soft">
            <button
              type="button"
              onClick={hasArtifacts ? () => toggle(source.url) : undefined}
              disabled={!hasArtifacts}
              className={`flex items-center gap-3 py-1.5 pl-4 pr-3 w-full text-left text-xs transition-colors ${hasArtifacts ? 'sf-row-hoverable' : 'opacity-70'}`}
            >
              {hasArtifacts && (
                <span className={`text-[10px] sf-text-subtle transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>
              )}
              {!hasArtifacts && <span className="w-[10px] shrink-0" />}
              <span className={`font-mono text-[10px] w-8 shrink-0 ${httpStatusClass(source.status, source.blocked)}`}>
                {source.status}
              </span>
              <span className="font-mono sf-text-primary truncate flex-1" title={source.url}>
                {source.url}
              </span>
              {source.total_size != null && source.total_size > 0 && (
                <span className="font-mono sf-text-muted text-[10px] w-[56px] text-right shrink-0">
                  {formatBytes(source.total_size)}
                </span>
              )}
              <span className="font-mono sf-text-muted text-[10px] w-[56px] text-right shrink-0">
                {source.content_hash?.slice(0, 8) || '\u2014'}
              </span>
            </button>
            {isOpen && <ArtifactRow source={source} />}
          </div>
        );
      })}
    </div>
  );
}
