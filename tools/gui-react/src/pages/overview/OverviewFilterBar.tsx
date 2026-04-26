import { memo } from 'react';
import {
  SearchBox,
  ResultMeter,
} from '../../shared/ui/filterBar/index.ts';

export interface OverviewFilterState {
  readonly search: string;
}

export interface OverviewFilterBarProps {
  readonly state: OverviewFilterState;
  readonly onChange: (next: OverviewFilterState) => void;
  readonly shown: number;
  readonly total: number;
}

/**
 * Single-row filter strip for the Overview catalog. Header clicks own all
 * sorting, so this surface only carries search and result count.
 */
export const OverviewFilterBar = memo(function OverviewFilterBar({
  state, onChange, shown, total,
}: OverviewFilterBarProps) {
  const setField = <K extends keyof OverviewFilterState>(key: K, value: OverviewFilterState[K]) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <div className="sf-surface-alt border sf-border-soft rounded-lg shadow-sm px-3 py-2 flex items-center gap-3 flex-wrap">
      <SearchBox
        value={state.search}
        onChange={(v) => setField('search', v)}
        placeholder="Search brand, model, variant, id..."
        ariaLabel="Search catalog"
      />

      <span className="ml-auto">
        <ResultMeter shown={shown} total={total} />
      </span>
    </div>
  );
});
