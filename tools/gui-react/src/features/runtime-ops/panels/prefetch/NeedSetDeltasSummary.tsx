import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import type { DeltaCategories } from './needSetHelpers.ts';

/* ── Props ──────────────────────────────────────────────────────────── */

export interface NeedSetDeltasSummaryProps {
  deltaCats: DeltaCategories;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function NeedSetDeltasSummary({ deltaCats }: NeedSetDeltasSummaryProps) {
  return (
    <div>
      <SectionHeader>what changed this round</SectionHeader>
      <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 space-y-3">
        {/* Counter cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
          <div>
            <div className={`text-[22px] font-bold leading-none ${deltaCats.resolved.length > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-subtle'}`}>
              {deltaCats.resolved.length > 0 ? `+${deltaCats.resolved.length}` : '0'}
            </div>
            <div className={`mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] ${deltaCats.resolved.length > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-subtle'}`}>resolved</div>
          </div>
          <div>
            <div className={`text-[22px] font-bold leading-none ${deltaCats.improved.length > 0 ? 'text-[var(--sf-token-accent)]' : 'sf-text-subtle'}`}>
              {deltaCats.improved.length > 0 ? `+${deltaCats.improved.length}` : '0'}
            </div>
            <div className={`mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] ${deltaCats.improved.length > 0 ? 'text-[var(--sf-token-accent)]' : 'sf-text-subtle'}`}>improved</div>
          </div>
          <div>
            <div className="text-[22px] font-bold sf-text-subtle leading-none">{deltaCats.newFields.length}</div>
            <div className="mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] sf-text-subtle">new</div>
          </div>
          <div>
            <div className={`text-[22px] font-bold leading-none ${deltaCats.escalated.length > 0 ? 'text-[var(--sf-state-confirm-fg)]' : 'sf-text-subtle'}`}>
              {deltaCats.escalated.length > 0 ? `+${deltaCats.escalated.length}` : '0'}
            </div>
            <div className={`mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] ${deltaCats.escalated.length > 0 ? 'text-[var(--sf-state-confirm-fg)]' : 'sf-text-subtle'}`}>escalated</div>
          </div>
          <div>
            <div className="text-[22px] font-bold sf-text-muted leading-none">{deltaCats.regressed.length}</div>
            <div className="mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] sf-text-muted">regressed</div>
          </div>
        </div>
        {/* Field chips */}
        <div className="flex flex-wrap gap-1.5 pt-3 border-t sf-border-soft">
          {deltaCats.resolved.map((f) => (
            <span key={f} className="sf-chip-success inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold border sf-border-soft">
              {'\u2713'} {f}
            </span>
          ))}
          {deltaCats.improved.map((f) => (
            <span key={f} className="sf-chip-info inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold border sf-border-soft">
              {'\u2191'} {f}
            </span>
          ))}
          {deltaCats.escalated.map((f) => (
            <span key={f} className="sf-chip-confirm inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold border sf-border-soft">
              {'\u26a0'} {f}
            </span>
          ))}
          {deltaCats.regressed.map((f) => (
            <span key={f} className="sf-chip-neutral inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold border sf-border-soft">
              {'\u2193'} {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
