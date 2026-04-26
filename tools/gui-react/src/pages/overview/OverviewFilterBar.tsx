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
}

export interface OverviewFilterBarProps {
  readonly state: OverviewFilterState;
  readonly onChange: (next: OverviewFilterState) => void;
  readonly shown: number;
  readonly total: number;
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
 * chips, result meter. The Active row above the table now surfaces running
 * products as a first-class group, so the previous "Active first" toggle is
 * retired.
 */
export const OverviewFilterBar = memo(function OverviewFilterBar({
  state, onChange, shown, total,
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

      <span className="ml-auto">
        <ResultMeter shown={shown} total={total} />
      </span>
    </div>
  );
});
