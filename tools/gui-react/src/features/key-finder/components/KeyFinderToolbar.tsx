/**
 * KeyFinderToolbar — product-level header: title + product actions + KPI strip + filters.
 *
 * Product-level action buttons (Run all groups / Loop all groups) are Phase 5;
 * rendered disabled today with phase-naming tooltips. History button is live.
 */

import { memo, useMemo } from 'react';
import { FinderKpiCard } from '../../../shared/ui/finder/FinderKpiCard.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import type { KeyFilterState, GroupedRows } from '../types.ts';
import { LIVE_MODES, DISABLED_REASONS } from '../types.ts';

interface CountsBySlot {
  readonly difficulty: Record<string, number>;
  readonly availability: Record<string, number>;
  readonly required: Record<string, number>;
  readonly status: Record<string, number>;
}

interface KeyFinderToolbarProps {
  readonly productLabel: string;
  readonly category: string;
  readonly grouped: GroupedRows;
  readonly filters: KeyFilterState;
  readonly onFilterChange: <K extends keyof KeyFilterState>(key: K, value: KeyFilterState[K]) => void;
  readonly onResetFilters: () => void;
  readonly hasActiveFilters: boolean;
  readonly onOpenProductHistory: () => void;
  readonly onRunAllGroups: () => void;
  readonly onLoopAllGroups: () => void;
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
  productLabel,
  category,
  grouped,
  filters,
  onFilterChange,
  onResetFilters,
  hasActiveFilters,
  onOpenProductHistory,
  onRunAllGroups,
  onLoopAllGroups,
}: KeyFinderToolbarProps) {
  const counts = useMemo(() => countsFromGroups(grouped), [grouped]);

  return (
    <div>
      {/* Product header bar */}
      <div
        className="flex items-center gap-3 px-5 py-3 text-white rounded-t-lg"
        style={{ background: 'linear-gradient(180deg, #4263eb, #3b56d6)' }}
      >
        <div className="flex-1">
          <div className="text-[14px] font-bold leading-tight">Per-Key Finder</div>
          <div className="text-[12px] opacity-85 mt-0.5">
            {productLabel} · {category} · <strong>{grouped.totals.eligible} eligible keys</strong>
            {grouped.totals.excluded > 0 ? ` · ${grouped.totals.excluded} filtered out` : ''}
          </div>
        </div>
        <button
          onClick={onOpenProductHistory}
          className="px-3 py-1.5 text-[12px] font-semibold rounded border"
          style={{ background: 'rgba(255,255,255,.18)', borderColor: 'rgba(255,255,255,.35)', color: 'white' }}
        >
          History
        </button>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.3)' }} />
        <button
          disabled={!LIVE_MODES.productLoop}
          title={LIVE_MODES.productLoop ? '' : DISABLED_REASONS.productLoop}
          onClick={onLoopAllGroups}
          className="px-3 py-1.5 text-[12px] font-semibold rounded border disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'rgba(255,255,255,.18)', borderColor: 'rgba(255,255,255,.35)', color: 'white' }}
        >
          ∞ Loop all groups
        </button>
        <button
          disabled={!LIVE_MODES.productRun}
          title={LIVE_MODES.productRun ? '' : DISABLED_REASONS.productRun}
          onClick={onRunAllGroups}
          className="px-3 py-1.5 text-[12px] font-semibold rounded border disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'rgba(255,255,255,.18)', borderColor: 'rgba(255,255,255,.35)', color: 'white' }}
        >
          ▶ Run all groups
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3 px-5 py-4 sf-surface-soft border-b sf-border-soft">
        <FinderKpiCard label="Keys in view" value={String(grouped.totals.eligible)} tone="neutral" />
        <FinderKpiCard label="Resolved" value={String(grouped.totals.resolved)} tone="success" />
        <FinderKpiCard label="Unresolved" value={String(grouped.totals.unresolved)} tone="warning" />
        <FinderKpiCard label="Running" value={String(grouped.totals.running)} tone={grouped.totals.running > 0 ? 'info' : 'neutral'} />
        <FinderKpiCard label="Groups" value={String(grouped.groups.length)} tone="neutral" />
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-2 px-5 py-2.5 sf-surface-alt border-b sf-border-soft flex-wrap">
        <input
          type="search"
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
          placeholder="Search keys or groups…"
          className="flex-1 min-w-[180px] max-w-[320px] px-3 py-1.5 text-[12.5px] rounded border sf-input"
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
            className="ml-auto px-2.5 py-1 text-[11.5px] font-semibold rounded sf-text-muted hover:sf-surface-soft"
          >
            Clear filters
          </button>
        )}
        <Tip text="Variant-dependent fields and finder-owned keys (CEF / RDF / SKF / EG-locked) are filtered out." />
      </div>
    </div>
  );
});
