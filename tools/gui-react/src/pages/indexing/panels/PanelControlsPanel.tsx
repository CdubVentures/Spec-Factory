import { Tip } from '../../../components/common/Tip';
import { usePersistedToggle } from '../../../stores/collapseStore';
import { panelStateChipClasses } from '../helpers';
import type { PanelStateToken } from '../types';

interface ContainerStatusRow {
  label: string;
  state: PanelStateToken;
  detail: string;
}

interface PanelControlsPanelProps {
  containerStatuses: ContainerStatusRow[];
  onOpenAll: () => void;
  onCloseAll: () => void;
  persistKey?: string;
  embedded?: boolean;
}

export function PanelControlsPanel({
  containerStatuses,
  onOpenAll,
  onCloseAll,
  persistKey = 'indexing:panelControls:open',
  embedded = false,
}: PanelControlsPanelProps) {
  const [open, , setOpen] = usePersistedToggle(persistKey, true);
  const body = (
    <div className={embedded ? 'space-y-2' : 'mt-2 space-y-2'}>
      <div className="flex flex-wrap items-center justify-between gap-2 sf-text-caption">
        <div className="sf-text-muted">Container visibility shortcuts</div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAll}
            className="px-2 py-1 sf-icon-button"
            title="Open all containers."
          >
            Open all
          </button>
          <button
            onClick={onCloseAll}
            className="px-2 py-1 sf-icon-button"
            title="Close all containers."
          >
            Close all
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 text-xs">
        {containerStatuses.map((row) => (
          <div key={`container-status:${row.label}`} className="sf-surface-elevated px-2 py-1 flex items-center justify-between gap-2">
            <div className="sf-text-muted">{row.label}</div>
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded ${panelStateChipClasses(row.state)}`}>
                {row.state}
              </span>
              <span className="sf-text-subtle">{row.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <details
      open={open}
      onToggle={(event) => {
        const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
        if (nextOpen !== open) setOpen(nextOpen);
      }}
      className="group sf-surface-panel p-2"
      style={{ order: 15 }}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 sf-text-caption sf-text-primary">
        <span className="inline-flex items-center font-semibold">
          <span className="inline-flex h-4 w-4 items-center justify-center sf-icon-button sf-text-caption leading-none mr-1">
            <span className="group-open:hidden">+</span>
            <span className="hidden group-open:inline">-</span>
          </span>
          Panel Controls
          <Tip text="Open or close major dashboard containers and inspect each panel state." />
        </span>
      </summary>
      {body}
    </details>
  );
}
