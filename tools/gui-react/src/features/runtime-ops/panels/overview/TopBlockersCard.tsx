import type { RuntimeOpsBlocker } from '../../types.ts';
import { METRIC_TIPS } from '../../helpers.ts';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';

interface TopBlockersCardProps {
  blockers: RuntimeOpsBlocker[];
}

function BlockerRow({ blocker, maxErrors }: { blocker: RuntimeOpsBlocker; maxErrors: number }) {
  const pct = maxErrors > 0 ? Math.round((blocker.error_count / maxErrors) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex-1 font-mono text-xs sf-text-primary truncate" title={blocker.host}>
        {blocker.host}
      </span>
      <div className="w-28 shrink-0">
        <div className="h-1.5 sf-meter-track rounded-full">
          <div
            className="h-full rounded-full sf-meter-fill-danger transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="text-[10px] font-bold font-mono sf-status-text-danger w-8 text-right shrink-0">
        {blocker.error_count}
      </span>
    </div>
  );
}

export function TopBlockersCard({ blockers }: TopBlockersCardProps) {
  if (blockers.length === 0) return null;
  const maxErrors = blockers[0].error_count;

  return (
    <div className="sf-surface-card rounded-lg p-4">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-2">
        Top Blockers
        <Tip text={METRIC_TIPS.top_blockers} />
      </h3>
      <div className="divide-y sf-border-soft">
        {blockers.map((b) => (
          <BlockerRow key={b.host} blocker={b} maxErrors={maxErrors} />
        ))}
      </div>
    </div>
  );
}
