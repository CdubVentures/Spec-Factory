import {
  useColumnFilterStore,
  selectFilterState,
  type ColumnFilterKey,
  type HasValueMode,
  type ScalarFilter,
} from '../columnFilterStore.ts';
import './FilterControls.css';

const HAS_VALUE_OPTIONS: ReadonlyArray<{ value: HasValueMode; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Has value' },
  { value: 'no', label: 'Missing' },
];

export interface ScalarVariantFilterProps {
  readonly category: string;
  readonly filterKey: Extract<ColumnFilterKey, 'rdf' | 'sku'>;
}

export function ScalarVariantFilter({ category, filterKey }: ScalarVariantFilterProps) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const patch = useColumnFilterStore((s) => s.patch);
  const filter = filterState[filterKey] as ScalarFilter;

  const setHasValue = (value: HasValueMode) =>
    patch(category, filterKey, { ...filter, hasValue: value });
  const setMinConfidence = (raw: string) => {
    if (raw.trim() === '') {
      patch(category, filterKey, { ...filter, minConfidence: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    patch(category, filterKey, { ...filter, minConfidence: n / 100 });
  };

  const minInput =
    filter.minConfidence === null ? '' : String(Math.round(filter.minConfidence * 100));

  return (
    <div>
      <div className="sf-fc-section">
        <div className="sf-fc-label">Value (any variant)</div>
        <div className="sf-fc-segmented" role="radiogroup">
          {HAS_VALUE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={filter.hasValue === o.value}
              className={`sf-fc-seg ${filter.hasValue === o.value ? 'sf-fc-seg--active' : ''}`}
              onClick={() => setHasValue(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="sf-fc-section">
        <div className="sf-fc-label">Min confidence (any variant)</div>
        <div className="sf-fc-range-row">
          <label className="sf-fc-range-input">
            <span>≥</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              placeholder="0–100"
              value={minInput}
              onChange={(e) => setMinConfidence(e.target.value)}
            />
            <span className="sf-fc-range-suffix">%</span>
          </label>
        </div>
      </div>
    </div>
  );
}
