import { useId } from 'react';
import {
  useColumnFilterStore,
  selectFilterState,
  type ColumnFilterKey,
  type NumericRange,
} from '../columnFilterStore.ts';
import './FilterControls.css';

export type RangeUnit = 'percent' | 'count';

export interface NumericRangeFilterProps {
  readonly category: string;
  readonly filterKey: Extract<ColumnFilterKey, 'coverage' | 'confidence' | 'fields'>;
  readonly label: string;
  readonly unit: RangeUnit;
}

function rangeFromState(unit: RangeUnit, range: NumericRange): { min: string; max: string } {
  const fmt = (v: number) => (unit === 'percent' ? String(Math.round(v * 100)) : String(v));
  return {
    min: range.min === null ? '' : fmt(range.min),
    max: range.max === null ? '' : fmt(range.max),
  };
}

function parseInput(unit: RangeUnit, raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return unit === 'percent' ? n / 100 : n;
}

export function NumericRangeFilter({
  category,
  filterKey,
  label,
  unit,
}: NumericRangeFilterProps) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const patch = useColumnFilterStore((s) => s.patch);
  const range = filterState[filterKey] as NumericRange;
  const minId = useId();
  const maxId = useId();
  const inputs = rangeFromState(unit, range);

  const onChange = (which: 'min' | 'max', raw: string) => {
    const next: NumericRange = { ...range, [which]: parseInput(unit, raw) };
    patch(category, filterKey, next);
  };

  const suffix = unit === 'percent' ? '%' : '';
  const placeholder = unit === 'percent' ? '0–100' : '#';

  return (
    <div className="sf-fc-section">
      <div className="sf-fc-label">{label}</div>
      <div className="sf-fc-range-row">
        <label className="sf-fc-range-input">
          <span>Min</span>
          <input
            id={minId}
            type="number"
            inputMode="numeric"
            min={0}
            max={unit === 'percent' ? 100 : undefined}
            placeholder={placeholder}
            value={inputs.min}
            onChange={(e) => onChange('min', e.target.value)}
          />
          {suffix && <span className="sf-fc-range-suffix">{suffix}</span>}
        </label>
        <label className="sf-fc-range-input">
          <span>Max</span>
          <input
            id={maxId}
            type="number"
            inputMode="numeric"
            min={0}
            max={unit === 'percent' ? 100 : undefined}
            placeholder={placeholder}
            value={inputs.max}
            onChange={(e) => onChange('max', e.target.value)}
          />
          {suffix && <span className="sf-fc-range-suffix">{suffix}</span>}
        </label>
      </div>
    </div>
  );
}
