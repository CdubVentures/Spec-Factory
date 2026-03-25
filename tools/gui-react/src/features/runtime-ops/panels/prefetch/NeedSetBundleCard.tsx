import { useMemo } from 'react';
import type { PrefetchSearchPlanBundle } from '../../types.ts';
import { resolveNeedsetState, resolveNeedsetBucket } from '../../badgeRegistries.ts';
import { phaseBadgeCls, nextAction } from './needSetHelpers.ts';

/* ── Props ──────────────────────────────────────────────────────────── */

export interface NeedSetBundleCardProps {
  bundle: PrefetchSearchPlanBundle;
  expanded: boolean;
  onToggle: () => void;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function NeedSetBundleCard({ bundle, expanded, onToggle }: NeedSetBundleCardProps) {
  const fields = bundle.fields ?? [];
  const satisfiedCount = fields.filter(f => f.state === 'satisfied').length;
  const totalCount = fields.length;
  const progressPct = totalCount > 0 ? (satisfiedCount / totalCount) * 100 : 0;
  const isActive = bundle.phase === 'now' || fields.some(f => f.state !== 'satisfied');

  const sortedFields = useMemo(() =>
    [...fields].sort((a, b) => {
      const order: Record<string, number> = { core: 0, secondary: 1, expected: 2, optional: 3 };
      return (order[a.bucket] ?? 9) - (order[b.bucket] ?? 9);
    }),
  [fields]);

  return (
    <div className={`sf-surface-elevated border sf-border-soft rounded-sm transition-opacity ${isActive ? 'opacity-100' : 'opacity-70'}`}>
      {/* Clickable header */}
      <div
        onClick={onToggle}
        className="grid gap-4 px-5 py-3.5 cursor-pointer select-none"
        /* WHY: 3-col grid matches reference — phase pill | content | progress */
        style={{ gridTemplateColumns: 'auto 1fr auto' }}
      >
        {/* Phase pill */}
        <div className="pt-0.5">
          <span className={`inline-block px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] ${phaseBadgeCls(bundle.phase)}`}>
            {bundle.phase || 'hold'}
          </span>
        </div>

        {/* Center: label + desc + metadata grid */}
        <div className="min-w-0">
          <div className="text-[15px] font-bold sf-text-primary leading-tight">{bundle.label || bundle.key}</div>
          <div className="mt-0.5 text-xs sf-text-muted truncate">{bundle.desc}</div>

          {/* Metadata grid — reason from LLM planner */}
          {isActive && bundle.reason_active && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 mt-2.5 pt-2 border-t sf-border-soft">
              {([
                ['reason active', bundle.reason_active],
              ] as const).filter(([, val]) => val).map(([lbl, val]) => (
                <div key={lbl} className="flex gap-1.5 items-baseline">
                  <span className="text-[8px] font-bold uppercase tracking-[0.08em] sf-text-subtle shrink-0 min-w-[3.2rem]">{lbl}</span>
                  <span className="text-[11px] font-mono sf-text-muted">{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inactive message */}
          {!isActive && (
            <div className="text-[10px] font-mono sf-text-subtle italic mt-1">Not queued this round</div>
          )}
        </div>

        {/* Right: ratio + bar */}
        <div className="text-right shrink-0 min-w-[8.5rem]">
          <div className={`text-[13px] font-bold font-mono mb-1.5 ${progressPct === 100 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-primary'}`}>
            {satisfiedCount}/{totalCount}
          </div>
          {/* Progress bar — fixed width + border to match reference */}
          <div className="w-[130px] ml-auto h-1 rounded-sm overflow-hidden sf-bg-surface-soft-strong border sf-border-soft">
            <div
              className={`h-full rounded-sm transition-all ${progressPct === 100 ? 'bg-[var(--sf-state-success-fg)]' : 'bg-[var(--sf-token-accent)]'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Expanded: field table */}
      {expanded && (
        <div className="border-t sf-border-soft overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="sf-surface-elevated">
                {['field', 'bucket', 'state', 'next action'].map(h => (
                  <th key={h} className="py-2 px-5 text-left text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle border-b sf-border-soft">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedFields.map(f => {
                const stB = resolveNeedsetState(f.state);
                const bB = resolveNeedsetBucket(f.bucket);
                return (
                  <tr key={f.key} className={`border-b sf-border-soft ${f.state === 'conflict' ? 'bg-[var(--sf-state-error-bg)]' : ''}`}>
                    <td className={`py-1.5 px-5 font-mono font-medium ${f.state === 'satisfied' ? 'sf-text-subtle' : 'sf-text-primary'}`}>{f.key}</td>
                    <td className="py-1.5 px-5"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.08em] ${bB.badge}`}>{bB.label}</span></td>
                    <td className="py-1.5 px-5">
                      <span className="inline-flex items-center gap-1">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${resolveNeedsetState(f.state).dot}`} />
                        <span className={`text-[10px] font-semibold uppercase tracking-[0.04em] ${stB.badge}`}>{stB.label}</span>
                      </span>
                    </td>
                    <td className="py-1.5 px-5 font-mono sf-text-muted">{nextAction(f.state)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
