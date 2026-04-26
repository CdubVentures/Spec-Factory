import { BILLING_CALL_TYPE_REGISTRY, BILLING_CALL_TYPE_GROUPS } from '../billingCallTypeRegistry.generated.ts';
import { chartColor } from '../billingTransforms.ts';
import type { BillingFilterState, FilterChipCounts } from '../billingTypes.ts';

interface BillingFilterBarProps {
  filters: BillingFilterState;
  onFilterChange: (next: BillingFilterState) => void;
  categories: readonly string[];
  models: readonly string[];
  counts?: FilterChipCounts;
}

const EMPTY_COUNTS: FilterChipCounts = Object.freeze({ model: {}, reason: {}, category: {} });

function chipClass(active: boolean): string {
  return active ? 'sf-filter-chip sf-filter-chip-active' : 'sf-filter-chip';
}

function fmtCount(n: number | undefined): string {
  if (!n || n <= 0) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function ChipCount({ n }: { n: number | undefined }) {
  const label = fmtCount(n);
  if (!label) return null;
  return <span className="sf-filter-chip-count">{label}</span>;
}

function hasAnyFilter(f: BillingFilterState): boolean {
  return Boolean(f.category || f.reason || f.model || f.access);
}

const EMPTY_FILTERS: BillingFilterState = { category: '', reason: '', model: '', access: '' };

export function BillingFilterBar({ filters, onFilterChange, categories, models, counts }: BillingFilterBarProps) {
  const resolvedCounts = counts ?? EMPTY_COUNTS;
  const setCategory = (v: string) => onFilterChange({ ...filters, category: v });
  const setReason = (v: string) => onFilterChange({ ...filters, reason: v });
  const setModel = (v: string) => onFilterChange({ ...filters, model: v });
  const setAccess = (v: string) => onFilterChange({ ...filters, access: v });
  const clearAll = () => onFilterChange(EMPTY_FILTERS);

  const totalCalls = Object.values(resolvedCounts.category).reduce((a, b) => a + b, 0);

  // WHY: Access counts split from the reason map — Lab = provider LIKE 'lab-%'
  // on the server; frontend derives a ballpark from the entries already loaded
  // via the summary? No — simplest honest approach: don't show access counts
  // unless we fetch them separately. Keep Category/Model/Reason counts only.

  return (
    <div className="sf-filter-bar">
      <div className="sf-filter-row">
        <span className="sf-filter-label">Category</span>
        <button className={chipClass(filters.category === '')} onClick={() => setCategory('')}>
          All <ChipCount n={totalCalls} />
        </button>
        {categories.map((cat) => (
          <button key={cat} className={chipClass(filters.category === cat)} onClick={() => setCategory(cat)}>
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
            <ChipCount n={resolvedCounts.category[cat]} />
          </button>
        ))}

        <span className="sf-filter-sep" />

        <span className="sf-filter-label">Access</span>
        <button className={chipClass(filters.access === '')} onClick={() => setAccess('')}>All</button>
        <button className={chipClass(filters.access === 'lab')} onClick={() => setAccess('lab')}>
          <span className="sf-filter-dot" style={{ background: 'var(--sf-token-state-info-fg)' }} />
          Lab
        </button>
        <button className={chipClass(filters.access === 'api')} onClick={() => setAccess('api')}>
          <span className="sf-filter-dot" style={{ background: 'var(--sf-token-text-subtle)' }} />
          API
        </button>
      </div>

      <div className="sf-filter-row">
        <span className="sf-filter-label">Call Type</span>
        <button className={chipClass(filters.reason === '')} onClick={() => setReason('')}>All</button>
        {BILLING_CALL_TYPE_GROUPS.map((group) => {
          const entries = BILLING_CALL_TYPE_REGISTRY.filter((e) => e.group === group);
          return (
            <span key={group} className="sf-filter-group">
              <span className="sf-filter-group-label">{group}</span>
              {entries.map((entry) => (
                <button key={entry.reason} className={chipClass(filters.reason === entry.reason)} onClick={() => setReason(entry.reason)}>
                  <span className="sf-filter-dot" style={{ background: chartColor(entry.color) }} />
                  {entry.label}
                  <ChipCount n={resolvedCounts.reason[entry.reason]} />
                </button>
              ))}
            </span>
          );
        })}
      </div>

      <div className="sf-filter-row">
        <span className="sf-filter-label">Model</span>
        <button className={chipClass(filters.model === '')} onClick={() => setModel('')}>All</button>
        {models.map((m) => (
          <button key={m} className={chipClass(filters.model === m)} onClick={() => setModel(m)}>
            {m}
            <ChipCount n={resolvedCounts.model[m]} />
          </button>
        ))}
        {hasAnyFilter(filters) ? (
          <button className="sf-filter-clear" onClick={clearAll}>Clear all filters ✕</button>
        ) : null}
      </div>
    </div>
  );
}
