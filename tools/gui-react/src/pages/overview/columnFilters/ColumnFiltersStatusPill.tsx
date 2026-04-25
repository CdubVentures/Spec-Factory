import {
  useColumnFilterStore,
  selectFilterState,
  activeColumnCount,
} from './columnFilterStore.ts';
import './ColumnFiltersStatusPill.css';

export function ColumnFiltersStatusPill({ category }: { category: string }) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const clearAll = useColumnFilterStore((s) => s.clearAll);
  const count = activeColumnCount(filterState);
  if (count === 0) return null;
  return (
    <span className="sf-cfp-pill" role="status">
      <span className="sf-cfp-count">{count}</span>
      <span className="sf-cfp-label">column filter{count === 1 ? '' : 's'} active</span>
      <button
        type="button"
        className="sf-cfp-clear"
        onClick={() => clearAll(category)}
      >
        Clear all
      </button>
    </span>
  );
}
