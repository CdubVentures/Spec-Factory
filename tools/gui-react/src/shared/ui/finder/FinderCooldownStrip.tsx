import type { CooldownState } from './types.ts';

export function FinderCooldownStrip({ cooldown }: { cooldown: CooldownState }) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-2.5 sf-surface-elevated rounded-lg">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted whitespace-nowrap">
        Cooldown
      </span>
      <div className="flex-1 h-1.5 rounded-full sf-surface-panel overflow-hidden">
        <div
          className={`h-full rounded-full ${cooldown.onCooldown ? 'bg-[var(--sf-state-warning-fg)]' : 'bg-[var(--sf-state-success-fg)]'}`}
          style={{ width: `${cooldown.progressPct}%` }}
        />
      </div>
      {cooldown.onCooldown ? (
        <>
          <span className="text-[10px] font-bold font-mono sf-status-text-warning">
            {cooldown.daysRemaining}d
          </span>
          <span className="text-[10px] font-mono sf-text-muted whitespace-nowrap">
            Eligible: {cooldown.eligibleDate}
          </span>
        </>
      ) : (
        <span className="text-[10px] font-bold font-mono sf-status-text-success">
          Ready
        </span>
      )}
    </div>
  );
}
