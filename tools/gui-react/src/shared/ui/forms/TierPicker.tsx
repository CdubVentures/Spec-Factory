import { TIER_DEFS } from '../../../utils/studioConstants.ts';

// Canonical order map: tier id → sort index
const CANONICAL_ORDER: Record<string, number> = {};
TIER_DEFS.forEach((t, i) => { CANONICAL_ORDER[t.id] = i; });

// WHY: Short labels for compact chip display. Full descriptions in title tooltip.
const SHORT_LABELS: Record<string, string> = {
  tier1: 'T1 Mfr',
  tier2: 'T2 Lab',
  tier3: 'T3 Retail',
  tier4: 'T4 Community',
  tier5: 'T5 Aggregator',
};

interface TierPickerProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function TierPicker({ value, onChange }: TierPickerProps) {
  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      const next = [...value, id].sort(
        (a, b) => (CANONICAL_ORDER[a] ?? 99) - (CANONICAL_ORDER[b] ?? 99),
      );
      onChange(next);
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {TIER_DEFS.map((tier) => {
        const checked = value.includes(tier.id);
        return (
          <button
            key={tier.id}
            type="button"
            onClick={() => toggle(tier.id)}
            title={tier.label}
            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
              checked
                ? 'sf-bg-accent sf-text-on-emphasis border-transparent'
                : 'sf-bg-surface-soft sf-text-subtle sf-border-default sf-hover-bg-surface-soft-strong'
            }`}
          >
            {SHORT_LABELS[tier.id] ?? tier.id}
          </button>
        );
      })}
    </div>
  );
}
