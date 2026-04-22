/**
 * FilterBar — rail-grid layout shell, rendered as a contained sub-panel.
 *
 * Visually wraps the filter bands in a bordered card with a subtle surface
 * tint so the filter area reads as ONE component instead of a series of
 * loose rows. Inside the card each band is `[rail · content · trail]`:
 * fixed 96px right-aligned label column, content flows horizontally, trail
 * (optional) collects right-aligned controls on the first band.
 *
 * Consumer pattern:
 *
 *   <FilterBar>
 *     <FilterBar.Band trail={<Tools />}>...search + meter...</FilterBar.Band>
 *     <FilterBar.Band rail="Quick">...presets...</FilterBar.Band>
 *     <FilterBar.Band rail="Difficulty" surface="soft">...seg...</FilterBar.Band>
 *   </FilterBar>
 */

import type { ReactNode } from 'react';

interface FilterBarProps {
  readonly children: ReactNode;
  readonly className?: string;
}

interface FilterBarBandProps {
  readonly rail?: string;
  readonly trail?: ReactNode;
  readonly surface?: 'default' | 'soft';
  readonly children: ReactNode;
}

function FilterBarBand({ rail, trail, surface = 'default', children }: FilterBarBandProps) {
  const surfaceClass = surface === 'soft' ? 'sf-surface-soft' : '';
  return (
    <div
      className={`grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5 border-t sf-border-soft first:border-t-0 ${surfaceClass}`.trim()}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.07em] sf-text-muted text-right pr-1 truncate">
        {rail ?? ''}
      </div>
      <div className="flex items-center flex-wrap gap-1.5 min-w-0">
        {children}
      </div>
      <div className="flex items-center gap-1.5 justify-end">
        {trail ?? null}
      </div>
    </div>
  );
}

export function FilterBar({ children, className = '' }: FilterBarProps) {
  return (
    <div
      className={`sf-surface-alt border sf-border-soft rounded-lg mx-3 my-3 overflow-hidden shadow-sm ${className}`.trim()}
    >
      {children}
    </div>
  );
}

FilterBar.Band = FilterBarBand;
