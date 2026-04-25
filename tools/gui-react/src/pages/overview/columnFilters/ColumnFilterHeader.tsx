import { useState, type ReactNode } from 'react';
import { Popover } from '../../../shared/ui/overlay/Popover.tsx';
import {
  useColumnFilterStore,
  selectFilterState,
  isColumnActive,
  type ColumnFilterKey,
} from './columnFilterStore.ts';
import './ColumnFilterHeader.css';

export interface ColumnFilterHeaderProps {
  readonly category: string;
  readonly filterKey: ColumnFilterKey;
  readonly label: string;
  readonly align?: 'left' | 'center';
  readonly children?: ReactNode;
}

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`sf-cfh-icon ${active ? 'sf-cfh-icon--active' : ''}`}
      viewBox="0 0 16 16"
      width="11"
      height="11"
      aria-hidden
    >
      <path
        d="M3 4h10M5 8h6M7 12h2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ColumnFilterHeader({
  category,
  filterKey,
  label,
  align = 'left',
  children,
}: ColumnFilterHeaderProps) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const clearColumn = useColumnFilterStore((s) => s.clearColumn);
  const active = isColumnActive(filterState, filterKey);
  const [open, setOpen] = useState(false);

  return (
    <span className={`sf-cfh-row sf-cfh-row--${align}`}>
      <span className="sf-cfh-label">{label}</span>
      <Popover
        placement="bottom"
        open={open}
        onOpenChange={setOpen}
        triggerLabel={`Filter ${label}`}
        triggerClassName={`sf-cfh-trigger ${active ? 'sf-cfh-trigger--active' : ''}`}
        contentClassName="sf-cfh-panel"
        trigger={
          <span className="sf-cfh-icon-wrap">
            <FilterIcon active={active} />
            {active ? <span className="sf-cfh-dot" aria-hidden /> : null}
          </span>
        }
      >
        <div className="sf-cfh-body">{children}</div>
        <div className="sf-cfh-footer">
          <button
            type="button"
            className="sf-cfh-btn sf-cfh-btn--clear"
            onClick={() => clearColumn(category, filterKey)}
            disabled={!active}
          >
            Clear
          </button>
          <button
            type="button"
            className="sf-cfh-btn sf-cfh-btn--done"
            onClick={() => setOpen(false)}
          >
            Done
          </button>
        </div>
      </Popover>
    </span>
  );
}
