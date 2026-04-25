import {
  useColumnFilterStore,
  selectFilterState,
} from '../columnFilterStore.ts';
import './FilterControls.css';

const TIERS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'mandatory', label: 'Mandatory' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'very_hard', label: 'Very Hard' },
];

export function KeysFilter({ category }: { category: string }) {
  const filterState = useColumnFilterStore(selectFilterState(category));
  const patch = useColumnFilterStore((s) => s.patch);
  const filter = filterState.keys;

  const toggleTier = (tier: string) => {
    const next = filter.tiers.includes(tier)
      ? filter.tiers.filter((t) => t !== tier)
      : [...filter.tiers, tier];
    patch(category, 'keys', { ...filter, tiers: next });
  };

  const onMin = (raw: string) => {
    if (raw.trim() === '') {
      patch(category, 'keys', { ...filter, minResolvedPct: null });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    patch(category, 'keys', { ...filter, minResolvedPct: n });
  };

  const minInput = filter.minResolvedPct === null ? '' : String(filter.minResolvedPct);

  return (
    <div>
      <div className="sf-fc-section">
        <div className="sf-fc-label">Tiers (any selected)</div>
        <div className="sf-fc-tier-row">
          {TIERS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={filter.tiers.includes(t.value)}
              className={`sf-fc-tier-chip ${filter.tiers.includes(t.value) ? 'sf-fc-tier-chip--active' : ''}`}
              onClick={() => toggleTier(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="sf-fc-section">
        <div className="sf-fc-label">Min resolved %</div>
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
              onChange={(e) => onMin(e.target.value)}
            />
            <span className="sf-fc-range-suffix">%</span>
          </label>
        </div>
      </div>
    </div>
  );
}
