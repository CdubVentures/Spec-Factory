/**
 * KeyFinderToolbar — polished filter bar (Variant C v2).
 *
 * Rail-grid layout across four bands:
 *   1. search + result meter + tools (Clear / Expand all / Collapse all / info)
 *   2. quick presets (6 pills; preset is derived-on when filter state matches)
 *   3. Difficulty · Availability segmented chip rows
 *   4. Required · Status segmented chip rows
 *
 * State semantics unchanged: the toolbar still writes through `onFilterChange`
 * per-axis. Presets are syntactic sugar — a click walks the 4 axes via
 * sequential updateFilter() calls which React 18 batches into one render.
 */

import { memo, useCallback, useMemo } from 'react';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import {
  FilterBar,
  SearchBox,
  ResultMeter,
  PresetChip,
  ChipSegmentedGroup,
  ExpandIcon,
  CollapseIcon,
  RefreshIcon,
  type SegmentOption,
  type ChipTone,
} from '../../../shared/ui/filterBar/index.ts';
import {
  KEY_FINDER_PRESETS,
  matchingPreset,
  applyPreset,
  type PresetTone,
} from '../state/keyFinderPresets.ts';
import type { KeyFilterState, GroupedRows } from '../types.ts';

interface CountsBySlot {
  readonly difficulty: Record<string, number>;
  readonly availability: Record<string, number>;
  readonly required: Record<string, number>;
  readonly status: Record<string, number>;
  readonly mandatoryUnresolved: number;
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
    mandatoryUnresolved: 0,
  };
  const incr = (bucket: Record<string, number>, key: string | undefined) => {
    if (!key) return;
    bucket[key] = (bucket[key] ?? 0) + 1;
  };
  for (const g of grouped.groups) {
    for (const k of g.keys) {
      incr(counts.difficulty, k.difficulty);
      incr(counts.availability, k.availability);
      incr(counts.required, k.required_level);
      // WHY: null/empty last_status (never-run) buckets under 'unresolved' so
      // the status chip counts and the "Unresolved" preset count reflect the
      // user's mental model ("keys that still need work"). This matches the
      // pre-polish toolbar's `|| 'unresolved'` semantics.
      const st = k.running ? 'running' : (k.last_status || 'unresolved');
      incr(counts.status, st);
      if (k.required_level === 'mandatory' && !k.running && k.last_status !== 'resolved') {
        (counts as { mandatoryUnresolved: number }).mandatoryUnresolved += 1;
      }
    }
  }
  return counts;
}

function presetCount(presetId: string, base: number, counts: CountsBySlot): number {
  switch (presetId) {
    case 'all':                  return base;
    case 'unresolved':           return counts.status.unresolved ?? 0;
    case 'mandatory_unresolved': return counts.mandatoryUnresolved;
    case 'running':              return counts.status.running ?? 0;
    case 'below_threshold':      return counts.status.below_threshold ?? 0;
    case 'resolved':             return counts.status.resolved ?? 0;
    default:                     return 0;
  }
}

function presetToneToChipTone(tone: PresetTone): ChipTone {
  switch (tone) {
    case 'all':        return 'accent';
    case 'unresolved': return 'warning';
    case 'mandatory':  return 'confirm';
    case 'running':    return 'accent';
    case 'below':      return 'danger';
    case 'resolved':   return 'success';
  }
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
  const activePreset = useMemo(() => matchingPreset(filters), [filters]);

  const handleSearch = useCallback((next: string) => onFilterChange('search', next), [onFilterChange]);
  const handlePreset = useCallback((presetId: string) => {
    const next = applyPreset(presetId, filters.search);
    // React 18 batches these 4 synchronous state updates into one render.
    onFilterChange('difficulty', next.difficulty);
    onFilterChange('availability', next.availability);
    onFilterChange('required', next.required);
    onFilterChange('status', next.status);
  }, [filters.search, onFilterChange]);

  const setDifficulty   = useCallback((v: string) => onFilterChange('difficulty', v), [onFilterChange]);
  const setAvailability = useCallback((v: string) => onFilterChange('availability', v), [onFilterChange]);
  const setRequired     = useCallback((v: string) => onFilterChange('required', v), [onFilterChange]);
  const setStatus       = useCallback((v: string) => onFilterChange('status', v), [onFilterChange]);

  const { eligible, base } = grouped.totals;

  const difficultyOptions: readonly SegmentOption[] = useMemo(() => [
    { value: '',          label: 'All',       count: eligible },
    { value: 'easy',      label: 'easy',      count: counts.difficulty.easy      ?? 0, tone: 'success' },
    { value: 'medium',    label: 'medium',    count: counts.difficulty.medium    ?? 0, tone: 'info' },
    { value: 'hard',      label: 'hard',      count: counts.difficulty.hard      ?? 0, tone: 'warning' },
    { value: 'very_hard', label: 'very_hard', count: counts.difficulty.very_hard ?? 0, tone: 'danger' },
  ], [eligible, counts.difficulty]);

  const availabilityOptions: readonly SegmentOption[] = useMemo(() => [
    { value: '',          label: 'All',       count: eligible },
    { value: 'always',    label: 'always',    count: counts.availability.always    ?? 0, tone: 'muted' },
    { value: 'sometimes', label: 'sometimes', count: counts.availability.sometimes ?? 0, tone: 'muted' },
    { value: 'rare',      label: 'rare',      count: counts.availability.rare      ?? 0, tone: 'muted' },
  ], [eligible, counts.availability]);

  const requiredOptions: readonly SegmentOption[] = useMemo(() => [
    { value: '',              label: 'All',           count: eligible },
    { value: 'mandatory',     label: 'mandatory',     count: counts.required.mandatory     ?? 0, tone: 'confirm' },
    { value: 'non_mandatory', label: 'non-mandatory', count: counts.required.non_mandatory ?? 0, tone: 'muted' },
  ], [eligible, counts.required]);

  const statusOptions: readonly SegmentOption[] = useMemo(() => [
    { value: '',                label: 'All',        count: eligible },
    { value: 'resolved',        label: 'resolved',   count: counts.status.resolved        ?? 0, tone: 'success' },
    { value: 'unresolved',      label: 'unresolved', count: counts.status.unresolved      ?? 0, tone: 'warning' },
    { value: 'running',         label: 'running',    count: counts.status.running         ?? 0, tone: 'accent',  running: true },
    { value: 'below_threshold', label: 'below',      count: counts.status.below_threshold ?? 0, tone: 'danger' },
    { value: 'unk',             label: 'unk',        count: counts.status.unk             ?? 0, tone: 'muted' },
  ], [eligible, counts.status]);

  const infoText = `${grouped.totals.excluded} keys filtered out: variant-dependent fields (manual-override turf) + finder-owned keys (CEF / PIF / RDF / SKF).`;

  const activeCount =
    (filters.search ? 1 : 0) +
    (filters.difficulty ? 1 : 0) +
    (filters.availability ? 1 : 0) +
    (filters.required ? 1 : 0) +
    (filters.status ? 1 : 0);

  return (
    <FilterBar>
      {/* Band 1 — search + meter + tools */}
      <FilterBar.Band
        trail={
          <>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-semibold rounded border sf-chip-warning hover:opacity-90"
                title="Reset search and all axis filters"
              >
                <RefreshIcon className="w-3 h-3" />
                Clear filters · {activeCount}
              </button>
            )}
            <button
              type="button"
              onClick={onExpandAllGroups}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-semibold rounded border sf-border-soft sf-surface hover:sf-surface-alt"
              title="Expand every group"
            >
              <ExpandIcon className="w-3 h-3 sf-text-muted" />
              Expand all
            </button>
            <button
              type="button"
              onClick={onCollapseAllGroups}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-semibold rounded border sf-border-soft sf-surface hover:sf-surface-alt"
              title="Collapse every group"
            >
              <CollapseIcon className="w-3 h-3 sf-text-muted" />
              Collapse all
            </button>
            <Tip text={infoText} />
          </>
        }
      >
        <SearchBox
          value={filters.search}
          onChange={handleSearch}
          placeholder="Search keys or groups…"
          ariaLabel="Search keys or groups"
        />
        <ResultMeter shown={eligible} total={base} />
      </FilterBar.Band>

      {/* Band 2 — quick presets */}
      <FilterBar.Band rail="Quick">
        {KEY_FINDER_PRESETS.map((p) => (
          <PresetChip
            key={p.id}
            label={p.label}
            count={presetCount(p.id, base, counts)}
            tone={presetToneToChipTone(p.tone)}
            active={activePreset === p.id}
            running={p.id === 'running'}
            empty={p.id !== 'all' && presetCount(p.id, base, counts) === 0}
            quietActive={p.id === 'all'}
            onClick={() => handlePreset(p.id)}
          />
        ))}
      </FilterBar.Band>

      {/* Band 3 — Difficulty · Availability */}
      <FilterBar.Band rail="Difficulty" surface="soft">
        <ChipSegmentedGroup
          options={difficultyOptions}
          value={filters.difficulty}
          onChange={setDifficulty}
          ariaLabel="Filter by difficulty"
        />
      </FilterBar.Band>
      <FilterBar.Band rail="Availability" surface="soft">
        <ChipSegmentedGroup
          options={availabilityOptions}
          value={filters.availability}
          onChange={setAvailability}
          ariaLabel="Filter by availability"
        />
      </FilterBar.Band>

      {/* Band 4 — Required · Status */}
      <FilterBar.Band rail="Required" surface="soft">
        <ChipSegmentedGroup
          options={requiredOptions}
          value={filters.required}
          onChange={setRequired}
          ariaLabel="Filter by required level"
        />
      </FilterBar.Band>
      <FilterBar.Band rail="Status" surface="soft">
        <ChipSegmentedGroup
          options={statusOptions}
          value={filters.status}
          onChange={setStatus}
          ariaLabel="Filter by status"
        />
      </FilterBar.Band>
    </FilterBar>
  );
});
