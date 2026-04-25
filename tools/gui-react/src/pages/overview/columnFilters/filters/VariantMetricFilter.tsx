import {
  useColumnFilterStore,
  selectFilterState,
  type PifMetric,
} from '../columnFilterStore.ts';
import './FilterControls.css';

const METRICS: ReadonlyArray<{ value: PifMetric; label: string; unit: 'percent' | 'count' }> = [
  { value: 'priority', label: 'Priority filled', unit: 'percent' },
  { value: 'loop', label: 'Loop filled', unit: 'percent' },
  { value: 'hero', label: 'Hero filled', unit: 'percent' },
  { value: 'image', label: 'Image count', unit: 'count' },
];

export function VariantMetricFilter({ category }: { category: string }) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const patch = useColumnFilterStore((s) => s.patch);
  const filter = filterState.pif;
  const meta = METRICS.find((m) => m.value === filter.metric) ?? METRICS[0];

  const onMetric = (metric: PifMetric) => {
    patch(category, 'pif', { ...filter, metric });
  };
  const onMin = (raw: string) => {
    if (raw.trim() === '') {
      patch(category, 'pif', { ...filter, min: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const value = meta.unit === 'percent' ? n / 100 : n;
    patch(category, 'pif', { ...filter, min: value });
  };

  const inputValue =
    filter.min === null
      ? ''
      : meta.unit === 'percent'
        ? String(Math.round(filter.min * 100))
        : String(filter.min);

  return (
    <div className="sf-fc-section">
      <div className="sf-fc-label">Metric (any variant)</div>
      <select
        className="sf-fc-select"
        value={filter.metric}
        onChange={(e) => onMetric(e.target.value as PifMetric)}
      >
        {METRICS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <div className="sf-fc-label" style={{ marginTop: 6 }}>
        Min {meta.unit === 'percent' ? 'percent' : 'count'}
      </div>
      <div className="sf-fc-range-row">
        <label className="sf-fc-range-input">
          <span>≥</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={meta.unit === 'percent' ? 100 : undefined}
            placeholder={meta.unit === 'percent' ? '0–100' : '#'}
            value={inputValue}
            onChange={(e) => onMin(e.target.value)}
          />
          {meta.unit === 'percent' && <span className="sf-fc-range-suffix">%</span>}
        </label>
      </div>
    </div>
  );
}
