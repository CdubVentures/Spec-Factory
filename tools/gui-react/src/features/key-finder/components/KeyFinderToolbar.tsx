/**
 * KeyFinderToolbar — filter row + group expand/collapse-all controls.
 *
 * The 5 top-level KPI cards (Keys in view / Resolved / Unresolved / Running /
 * Groups) now render at the panel body top (see KeyFinderPanel) alongside
 * other finder panels. This component owns ONLY the filter bar inside the
 * collapsible Keys section.
 */

import { memo, useMemo } from 'react';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import type { KeyFilterState, GroupedRows } from '../types.ts';

interface CountsBySlot {
  readonly difficulty: Record<string, number>;
  readonly availability: Record<string, number>;
  readonly required: Record<string, number>;
  readonly status: Record<string, number>;
}

interface KeyFinderToolbarProps {
  readonly grouped: GroupedRows;
  readonly filters: KeyFilterState;
  readonly onFilterChange: <K extends keyof KeyFilterState>(key: K, value: KeyFilterState[K]) => void;
  readonly onResetFilters: () => void;
  readonly hasActiveFilters: boolean;
  readonly onExpandAllGroups: () => void;
  readonly onCollapseAllGroups: () => void;
}

function countsFromGroups(grouped: GroupedRows): CountsBySlot {
  const counts: CountsBySlot = {
    difficulty: {},
    availability: {},
    required: {},
    status: {},
  };
  for (const g of grouped.groups) {
    for (const k of g.keys) {
      if (k.difficulty) counts.difficulty[k.difficulty] = (counts.difficulty[k.difficulty] || 0) + 1;
      if (k.availability) counts.availability[k.availability] = (counts.availability[k.availability] || 0) + 1;
      if (k.required_level) counts.required[k.required_level] = (counts.required[k.required_level] || 0) + 1;
      const st = k.running ? 'running' : (k.last_status || 'unresolved');
      counts.status[st] = (counts.status[st] || 0) + 1;
    }
  }
  return counts;
}

export const KeyFinderToolbar = memo(function KeyFinderToolbar({
  grouped,
  filters,
  onFilterChange,
  onResetFilters,
  hasActiveFilters,
  onExpandAllGroups,
  onCollapseAllGroups,
}: KeyFinderToolbarProps) {
  const counts = useMemo(() => countsFromGroups(grouped), [grouped]);

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 sf-surface-alt border-b sf-border-soft flex-wrap">
      <input
        type="search"
        value={filters.search}
        onChange={(e) => onFilterChange('search', e.target.value)}
        placeholder="Search keys or groups…"
        className="flex-1 min-w-[180px] max-w-[280px] px-3 py-1.5 text-[12.5px] rounded border sf-input"
      />
      <select
        value={filters.difficulty}
        onChange={(e) => onFilterChange('difficulty', e.target.value)}
        className="px-2.5 py-1.5 text-[12px] rounded border sf-input"
      >
        <option value="">Difficulty · all</option>
        {['easy', 'medium', 'hard', 'very_hard'].map((d) => (
          <option key={d} value={d}>
            {d.replace('_', ' ')}{counts.difficulty[d] !== undefined ? ` (${counts.difficulty[d]})` : ''}
          </option>
        ))}
      </select>
      <select
        value={filters.availability}
        onChange={(e) => onFilterChange('availability', e.target.value)}
        className="px-2.5 py-1.5 text-[12px] rounded border sf-input"
      >
        <option value="">Availability · all</option>
        {['always', 'sometimes', 'rare'].map((a) => (
          <option key={a} value={a}>
            {a}{counts.availability[a] !== undefined ? ` (${counts.availability[a]})` : ''}
          </option>
        ))}
      </select>
      <select
        value={filters.required}
        onChange={(e) => onFilterChange('required', e.target.value)}
        className="px-2.5 py-1.5 text-[12px] rounded border sf-input"
      >
        <option value="">Required · all</option>
        <option value="mandatory">mandatory{counts.required.mandatory !== undefined ? ` (${counts.required.mandatory})` : ''}</option>
        <option value="non_mandatory">non-mandatory{counts.required.non_mandatory !== undefined ? ` (${counts.required.non_mandatory})` : ''}</option>
      </select>
      <select
        value={filters.status}
        onChange={(e) => onFilterChange('status', e.target.value)}
        className="px-2.5 py-1.5 text-[12px] rounded border sf-input"
      >
        <option value="">Status · all</option>
        <option value="resolved">resolved{counts.status.resolved !== undefined ? ` (${counts.status.resolved})` : ''}</option>
        <option value="unresolved">unresolved{counts.status.unresolved !== undefined ? ` (${counts.status.unresolved})` : ''}</option>
        <option value="below_threshold">below threshold{counts.status.below_threshold !== undefined ? ` (${counts.status.below_threshold})` : ''}</option>
        <option value="unk">unk{counts.status.unk !== undefined ? ` (${counts.status.unk})` : ''}</option>
        <option value="running">running{counts.status.running !== undefined ? ` (${counts.status.running})` : ''}</option>
      </select>
      {hasActiveFilters && (
        <button
          onClick={onResetFilters}
          className="px-2.5 py-1 text-[11.5px] font-semibold rounded sf-text-muted hover:sf-surface-soft"
        >
          Clear filters
        </button>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onExpandAllGroups}
        className="px-2.5 py-1 text-[11px] font-semibold rounded border sf-surface hover:sf-surface-alt whitespace-nowrap"
        title="Expand every group"
      >
        Expand all
      </button>
      <button
        type="button"
        onClick={onCollapseAllGroups}
        className="px-2.5 py-1 text-[11px] font-semibold rounded border sf-surface hover:sf-surface-alt whitespace-nowrap"
        title="Collapse every group"
      >
        Collapse all
      </button>
      <Tip text="Variant-dependent fields and finder-owned keys (CEF / RDF / SKF / EG-locked) are filtered out." />
    </div>
  );
});
