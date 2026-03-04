import { Tip } from '../../../components/common/Tip';
import { usePersistedToggle } from '../../../stores/collapseStore';

interface SessionCrawledCell {
  key: string;
  label: string;
  value: string;
  tooltip: string;
  placeholder?: boolean;
}

interface SessionDataPanelProps {
  selectedIndexLabRunId: string;
  sessionCrawledCells: SessionCrawledCell[];
  persistKey?: string;
  embedded?: boolean;
}

export function SessionDataPanel({
  selectedIndexLabRunId,
  sessionCrawledCells,
  persistKey = 'indexing:sessionData:open',
  embedded = false,
}: SessionDataPanelProps) {
  const [open, , setOpen] = usePersistedToggle(persistKey, true);
  const body = (
    <div className={`${embedded ? '' : 'mt-2 '}grid grid-cols-1 xl:grid-cols-1 gap-2 sf-text-caption`}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {sessionCrawledCells.slice(0, 5).map((cell) => (
          <div key={`session-craweds:top:${cell.key}`} className="sf-surface-elevated px-2 py-1">
            <div className="sf-text-muted flex items-center">
              {cell.label}
              <Tip text={cell.tooltip} />
            </div>
            <div className={`font-semibold ${cell.placeholder ? 'sf-status-text-warning' : 'sf-text-primary'}`}>
              {cell.value}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {sessionCrawledCells.slice(5).map((cell) => (
          <div key={`session-craweds:extra:${cell.key}`} className="sf-surface-elevated px-2 py-1">
            <div className="sf-text-muted flex items-center">
              {cell.label}
              <Tip text={cell.tooltip} />
            </div>
            <div className={`font-semibold ${cell.placeholder ? 'sf-status-text-warning' : 'sf-text-primary'}`}>
              {cell.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-1">
        <div className="sf-text-caption sf-text-muted">
          run {selectedIndexLabRunId || '-'}
        </div>
        {body}
      </div>
    );
  }

  return (
    <details
      open={open}
      onToggle={(event) => {
        const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
        if (nextOpen !== open) setOpen(nextOpen);
      }}
      className="group sf-surface-panel p-3"
      style={{ order: 16 }}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center text-sm font-semibold sf-text-primary">
          <span className="inline-flex h-4 w-4 items-center justify-center sf-icon-button sf-text-caption leading-none mr-1">
            <span className="group-open:hidden">+</span>
            <span className="hidden group-open:inline">-</span>
          </span>
          Session Data
          <Tip text="High-level run summary for crawl/fetch coverage and phase progression signals." />
        </span>
        <span className="sf-text-caption sf-text-muted">
          run {selectedIndexLabRunId || '-'}
        </span>
      </summary>
      {body}
    </details>
  );
}
