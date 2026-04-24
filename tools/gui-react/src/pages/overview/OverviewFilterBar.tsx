import { memo, useMemo } from 'react';
import {
  SearchBox,
  ResultMeter,
  ChipSegmentedGroup,
  type SegmentOption,
} from '../../shared/ui/filterBar/index.ts';

export type OverviewSortKey = 'default' | 'confidence' | 'coverage' | 'fields';

export interface OverviewFilterState {
  readonly search: string;
  readonly sortBy: OverviewSortKey;
  readonly activeFirst: boolean;
}

export interface OverviewFilterBarProps {
  readonly state: OverviewFilterState;
  readonly onChange: (next: OverviewFilterState) => void;
  readonly shown: number;
  readonly total: number;
  readonly runningCount: number;
}

const SORT_LABELS: Readonly<Record<OverviewSortKey, string>> = {
  default: 'Default',
  confidence: 'Confidence',
  coverage: 'Coverage',
  fields: 'Fields',
};

/**
 * Single-row filter / sort strip for the Overview catalog. Compact layout —
 * no rail labels, no stacked bands. Left → right: search, sort label, sort
 * chips, Active-first toggle, result meter.
 */
export const OverviewFilterBar = memo(function OverviewFilterBar({
  state, onChange, shown, total, runningCount,
}: OverviewFilterBarProps) {
  const sortOptions: SegmentOption[] = useMemo(() => [
    { value: 'default',    label: SORT_LABELS.default,    count: 0, tone: 'muted' },
    { value: 'confidence', label: SORT_LABELS.confidence, count: 0, tone: 'success' },
    { value: 'coverage',   label: SORT_LABELS.coverage,   count: 0, tone: 'info' },
    { value: 'fields',     label: SORT_LABELS.fields,     count: 0, tone: 'accent' },
  ], []);

  const setField = <K extends keyof OverviewFilterState>(key: K, value: OverviewFilterState[K]) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <div className="sf-surface-alt border sf-border-soft rounded-lg shadow-sm px-3 py-2 flex items-center gap-3 flex-wrap">
      <SearchBox
        value={state.search}
        onChange={(v) => setField('search', v)}
        placeholder="Search brand, model, variant, id…"
        ariaLabel="Search catalog"
      />

      <span className="text-[10px] font-bold uppercase tracking-[0.07em] sf-text-muted">Sort</span>
      <ChipSegmentedGroup
        options={sortOptions}
        value={state.sortBy}
        onChange={(v) => setField('sortBy', (v || 'default') as OverviewSortKey)}
        ariaLabel="Sort by"
      />

      <ActiveFirstToggle
        active={state.activeFirst}
        runningCount={runningCount}
        onToggle={() => setField('activeFirst', !state.activeFirst)}
      />

      <span className="ml-auto">
        <ResultMeter shown={shown} total={total} />
      </span>
    </div>
  );
});

interface ActiveFirstToggleProps {
  readonly active: boolean;
  readonly runningCount: number;
  readonly onToggle: () => void;
}

function ActiveFirstToggle({ active, runningCount, onToggle }: ActiveFirstToggleProps) {
  const base = active ? 'sf-filter-chip sf-filter-chip-active' : 'sf-filter-chip';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className={`${base} h-7`.trim()}
      title="Float products with any running finder op to the top of the list"
    >
      <span
        className={`sf-filter-dot ${runningCount > 0 ? 'animate-pulse' : ''}`.trim()}
        style={{ background: active ? 'rgba(255,255,255,0.85)' : 'var(--sf-state-success-fg)' }}
      />
      <span>Active first</span>
      {runningCount > 0 && <span className="sf-filter-chip-count">{runningCount}</span>}
    </button>
  );
}
