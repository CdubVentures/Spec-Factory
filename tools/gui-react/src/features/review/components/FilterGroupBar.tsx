import type { FilterGroupDef } from '../state/reviewFilterRegistry.ts';

interface FilterGroupBarProps {
  readonly def: FilterGroupDef;
  readonly value: string;
  readonly onChange: (key: string, value: string) => void;
}

export function FilterGroupBar({ def, value, onChange }: FilterGroupBarProps) {
  return (
    <>
      <div className="sf-review-brand-filter-separator w-px h-4 shrink-0" />
      <span className="sf-review-filter-group-label shrink-0 text-[10px]">{def.label}</span>
      {def.options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(def.key, opt.value)}
            className={`sf-review-brand-filter-toggle shrink-0 px-2 py-0.5 text-[10px] rounded border ${
              active
                ? 'sf-review-brand-filter-toggle-active'
                : 'sf-review-brand-filter-toggle-inactive'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </>
  );
}
