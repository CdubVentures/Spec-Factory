import { BILLING_CALL_TYPE_REGISTRY, resolveBillingCallType } from '../billingCallTypeRegistry.ts';
import { chartColor } from '../billingTransforms.ts';
import type { BillingFilterState } from '../billingTypes.ts';

interface BillingFilterBarProps {
  filters: BillingFilterState;
  onFilterChange: (next: BillingFilterState) => void;
  categories: readonly string[];
  models: readonly string[];
}

function chipClass(active: boolean): string {
  return active ? 'sf-filter-chip sf-filter-chip-active' : 'sf-filter-chip';
}

export function BillingFilterBar({ filters, onFilterChange, categories, models }: BillingFilterBarProps) {
  const setCategory = (v: string) => onFilterChange({ ...filters, category: v });
  const setReason = (v: string) => onFilterChange({ ...filters, reason: v });
  const setModel = (v: string) => onFilterChange({ ...filters, model: v });

  return (
    <div className="sf-filter-bar">
      {/* Category */}
      <span className="sf-filter-label">Category</span>
      <button className={chipClass(filters.category === '')} onClick={() => setCategory('')}>All</button>
      {categories.map((cat) => (
        <button key={cat} className={chipClass(filters.category === cat)} onClick={() => setCategory(cat)}>
          {cat.charAt(0).toUpperCase() + cat.slice(1)}
        </button>
      ))}

      <span className="sf-filter-sep" />

      {/* Call Type */}
      <span className="sf-filter-label">Call Type</span>
      <button className={chipClass(filters.reason === '')} onClick={() => setReason('')}>All</button>
      {BILLING_CALL_TYPE_REGISTRY.map((entry) => (
        <button key={entry.reason} className={chipClass(filters.reason === entry.reason)} onClick={() => setReason(entry.reason)}>
          <span className="sf-filter-dot" style={{ background: chartColor(entry.color) }} />
          {entry.label}
        </button>
      ))}

      <span className="sf-filter-sep" />

      {/* Model */}
      <span className="sf-filter-label">Model</span>
      <button className={chipClass(filters.model === '')} onClick={() => setModel('')}>All</button>
      {models.map((m) => (
        <button key={m} className={chipClass(filters.model === m)} onClick={() => setModel(m)}>
          {m}
        </button>
      ))}
    </div>
  );
}
