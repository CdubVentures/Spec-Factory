import { useMemo } from 'react';
import type { RunInventoryRow } from '../types.ts';
import { formatRelativeDate } from '../helpers.ts';

interface StatusBucket {
  status: string;
  count: number;
  color: string;
  bgClass: string;
}

const STATUS_META: Record<string, { color: string; bgClass: string }> = {
  completed: { color: 'var(--sf-token-state-success-fg)', bgClass: 'sf-meter-fill-success' },
  failed: { color: 'var(--sf-token-state-error-fg)', bgClass: 'sf-meter-fill-danger' },
  running: { color: 'var(--sf-token-state-warning-fg)', bgClass: 'sf-meter-fill-warning' },
};

function countByStatus(runs: RunInventoryRow[]): StatusBucket[] {
  const counts = new Map<string, number>();
  for (const r of runs) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }
  const order = ['completed', 'failed', 'running'];
  const result: StatusBucket[] = [];
  for (const status of order) {
    const count = counts.get(status);
    if (count) {
      const meta = STATUS_META[status] ?? { color: 'var(--sf-token-border-default)', bgClass: 'sf-meter-fill' };
      result.push({ status, count, ...meta });
    }
    counts.delete(status);
  }
  for (const [status, count] of counts) {
    result.push({ status, count, color: 'var(--sf-token-border-default)', bgClass: 'sf-meter-fill' });
  }
  return result;
}

interface RunStatusBarProps {
  runs: RunInventoryRow[];
  oldestRun: string | null;
  newestRun: string | null;
}

export function RunStatusBar({ runs, oldestRun, newestRun }: RunStatusBarProps) {
  const buckets = useMemo(() => countByStatus(runs), [runs]);
  const total = runs.length;

  return (
    <div className="sf-surface-card rounded-lg p-4 flex flex-col gap-3">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle">
        Run Status
      </h3>

      {buckets.length > 0 ? (
        <div className="space-y-2">
          {buckets.map((b) => {
            const pct = total > 0 ? Math.max(2, Math.round((b.count / total) * 100)) : 0;
            return (
              <div key={b.status} className="flex items-center gap-2">
                <span className="text-[10px] sf-text-muted w-[64px] shrink-0 capitalize">{b.status}</span>
                <div className="flex-1 h-1.5 sf-meter-track rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${b.bgClass}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-mono sf-text-muted w-[24px] text-right shrink-0">{b.count}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[10px] sf-text-subtle">No runs</div>
      )}

      <div className="flex gap-4 text-[10px] sf-text-muted mt-auto pt-2 border-t sf-border-soft">
        <span>Oldest: {formatRelativeDate(oldestRun)}</span>
        <span>Newest: {formatRelativeDate(newestRun)}</span>
      </div>
    </div>
  );
}
