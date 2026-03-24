import type { RuntimeOpsMetricsRailData, PoolMetric } from '../../types';
import { poolBadgeClass, poolMeterFillClass, pctString, METRIC_TIPS } from '../../helpers';
import { Tip } from '../../../../shared/ui/feedback/Tip';

interface MetricsRailProps {
  data: RuntimeOpsMetricsRailData | undefined;
}

function PoolCard({ label, pool }: { label: string; pool: PoolMetric }) {
  const total = pool.completed + pool.failed + pool.active;
  const utilization = total > 0 ? pool.active / Math.max(1, pool.active + pool.queued + 1) : 0;
  const widthPct = Math.round(utilization * 100);
  const poolTipKey = `pool_${label}` as keyof typeof METRIC_TIPS;

  return (
    <div className="rounded sf-surface-card p-2">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${poolBadgeClass(label)}`}>
          {label}<Tip text={METRIC_TIPS[poolTipKey] ?? ''} />
        </span>
        <span className="sf-text-caption sf-text-muted">{pool.active} active</span>
      </div>
      <div className="h-1.5 sf-meter-track rounded-full mb-1">
        <div
          className={`h-full rounded-full transition-all ${poolMeterFillClass(label)}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-2 sf-text-caption sf-text-muted">
        <span>done: {pool.completed}<Tip text={METRIC_TIPS.pool_done} /></span>
        <span>fail: {pool.failed}<Tip text={METRIC_TIPS.pool_fail} /></span>
      </div>
    </div>
  );
}

export function MetricsRail({ data }: MetricsRailProps) {
  const pools = data?.pool_metrics ?? {};
  const failure = data?.failure_metrics ?? { total_fetches: 0, fallback_count: 0, fallback_rate: 0, blocked_hosts: 0, retry_total: 0, no_progress_streak: 0 };

  return (
    <aside className="w-60 shrink-0 border-r sf-border-default overflow-y-auto p-3 space-y-4">
      <div>
        <h3 className="sf-text-caption font-semibold sf-text-subtle uppercase tracking-wide mb-2">
          Pools
        </h3>
        <div className="space-y-2">
          {['search', 'fetch', 'parse', 'llm'].map((key) => (
            <PoolCard
              key={key}
              label={key}
              pool={pools[key] ?? { active: 0, queued: 0, completed: 0, failed: 0 }}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="sf-text-caption font-semibold sf-text-subtle uppercase tracking-wide mb-2">
          Failures
        </h3>
        <div className="space-y-1.5 sf-text-caption">
          <div className="flex items-center justify-between">
            <span className="sf-text-muted">Fallback rate<Tip text={METRIC_TIPS.fallback_rate} /></span>
            <span className="font-mono">{pctString(failure.fallback_rate)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="sf-text-muted">Blocked hosts<Tip text={METRIC_TIPS.blocked_hosts} /></span>
            <span className="font-mono">{failure.blocked_hosts}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="sf-text-muted">Retries<Tip text={METRIC_TIPS.retries} /></span>
            <span className="font-mono">{failure.retry_total}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="sf-text-muted">No-progress<Tip text={METRIC_TIPS.no_progress} /></span>
            <span className="font-mono">{failure.no_progress_streak}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
