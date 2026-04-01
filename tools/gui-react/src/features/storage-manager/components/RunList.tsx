import { useState } from 'react';
import { Chip } from '@/shared/ui/feedback/Chip';
import type { RunInventoryRow } from '../types.ts';
import { formatBytes, formatDuration, formatRelativeDate, runSizeBytes } from '../helpers.ts';
import { SourceList } from './SourceList.tsx';

const STATUS_CLS: Record<string, string> = {
  completed: 'sf-chip-success',
  failed: 'sf-chip-danger',
  running: 'sf-chip-warning',
};

interface RunListProps {
  runs: RunInventoryRow[];
  onDeleteRun: (runId: string) => void;
  isDeleting: boolean;
}

export function RunList({ runs, onDeleteRun, isDeleting }: RunListProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="border-l-2 border-[var(--sf-token-accent)] ml-2 space-y-px">
      {runs.map((run) => {
        const isOpen = expanded[run.run_id] ?? false;
        const size = runSizeBytes(run);
        return (
          <div key={run.run_id} className="border-b sf-border-soft">
            <div className="flex items-center gap-3 py-2 pl-4 pr-3 sf-row-hoverable transition-colors">
              <button
                type="button"
                onClick={() => toggle(run.run_id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <span className={`text-[10px] sf-text-subtle transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9654;</span>
                <span className="font-mono text-xs sf-text-primary truncate" title={run.run_id}>
                  {run.run_id}
                </span>
              </button>
              <Chip label={run.status} className={STATUS_CLS[run.status] ?? 'sf-chip-neutral'} />
              <span className="text-xs font-mono sf-text-muted w-[64px] text-right shrink-0">
                {formatBytes(size)}
              </span>
              <span className="text-xs sf-text-muted w-[56px] text-right shrink-0" title={run.started_at}>
                {formatRelativeDate(run.started_at)}
              </span>
              <span className="text-xs sf-text-muted w-[52px] text-right shrink-0">
                {formatDuration(run.started_at, run.ended_at)}
              </span>
              <button
                type="button"
                onClick={() => onDeleteRun(run.run_id)}
                disabled={isDeleting}
                className="text-[10px] font-semibold sf-status-text-danger shrink-0 hover:underline disabled:opacity-50"
                aria-label={`Delete run ${run.run_id}`}
              >
                Delete
              </button>
            </div>
            {isOpen && <SourceList runId={run.run_id} />}
          </div>
        );
      })}
    </div>
  );
}
