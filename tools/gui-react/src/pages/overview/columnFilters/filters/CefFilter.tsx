import {
  useColumnFilterStore,
  selectFilterState,
  type CefBucket,
} from '../columnFilterStore.ts';
import './FilterControls.css';

const BUCKETS: ReadonlyArray<{ value: CefBucket; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: '0', label: '0 runs' },
  { value: '1', label: '1 run' },
  { value: '2', label: '2 runs' },
];

export function CefFilter({ category }: { category: string }) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const patch = useColumnFilterStore((s) => s.patch);
  const value = filterState.cef;

  return (
    <div className="sf-fc-section">
      <div className="sf-fc-label">CEF run count</div>
      <div className="sf-fc-segmented" role="radiogroup" aria-label="CEF run count">
        {BUCKETS.map((b) => (
          <button
            key={b.value}
            type="button"
            role="radio"
            aria-checked={value === b.value}
            className={`sf-fc-seg ${value === b.value ? 'sf-fc-seg--active' : ''}`}
            onClick={() => patch(category, 'cef', b.value)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
