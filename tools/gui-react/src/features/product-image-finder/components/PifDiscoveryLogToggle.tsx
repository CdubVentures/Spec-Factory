import { memo } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';

interface PifDiscoveryLogToggleProps {
  readonly log: { queries_run?: string[]; urls_checked?: string[]; notes?: string[] };
  readonly storageKey: string;
}

export const PifDiscoveryLogToggle = memo(function PifDiscoveryLogToggle({ log, storageKey }: PifDiscoveryLogToggleProps) {
  const [open, toggleOpen] = usePersistedToggle(storageKey, false);
  return (
    <div className="sf-surface-panel border sf-border-soft rounded-md">
      <button type="button" onClick={toggleOpen} className="w-full px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle flex items-center gap-1 text-left">
        <span className={`inline-block transition-transform text-[8px] ${open ? 'rotate-90' : ''}`}>&#9656;</span>
        Discovery Log
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {log.queries_run && log.queries_run.length > 0 && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Queries Run ({log.queries_run.length})</div>
              <div className="flex flex-col gap-0.5">
                {log.queries_run.map((q) => (
                  <span key={q} className="text-[10px] font-mono sf-text-subtle">{q}</span>
                ))}
              </div>
            </div>
          )}
          {log.urls_checked && log.urls_checked.length > 0 && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">URLs Checked ({log.urls_checked.length})</div>
              <div className="flex flex-col gap-0.5">
                {log.urls_checked.map((url) => (
                  <span key={url} className="text-[10px] font-mono sf-text-subtle truncate max-w-full" title={url}>{url}</span>
                ))}
              </div>
            </div>
          )}
          {log.notes && log.notes.length > 0 && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Notes</div>
              <div className="flex flex-col gap-0.5">
                {log.notes.map((n, i) => (
                  <span key={`note-${i}`} className="text-[10px] sf-text-subtle">{n}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
