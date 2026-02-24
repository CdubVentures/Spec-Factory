import type { RuntimeOpsMetricsRailData, PoolMetric } from '../types';
import { poolBadgeClass, pctString, METRIC_TIPS } from '../helpers';
import { Tip } from '../../../components/common/Tip';

interface MetricsRailProps {
  data: RuntimeOpsMetricsRailData | undefined;
}

function PoolCard({ label, pool }: { label: string; pool: PoolMetric }) {
  const total = pool.completed + pool.failed + pool.active;
  const utilization = total > 0 ? pool.active / Math.max(1, pool.active + pool.queued + 1) : 0;
  const widthPct = Math.round(utilization * 100);
  const poolTipKey = `pool_${label}` as keyof typeof METRIC_TIPS;

  return (
    <div className="rounded border border-gray-200 dark:border-gray-600 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${poolBadgeClass(label)}`}>
          {label}<Tip text={METRIC_TIPS[poolTipKey] ?? ''} />
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{pool.active} active</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full mb-1">
        <div
          className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-2 text-xs text-gray-500 dark:text-gray-400">
        <span>done: {pool.completed}<Tip text={METRIC_TIPS.pool_done} /></span>
        <span>fail: {pool.failed}<Tip text={METRIC_TIPS.pool_fail} /></span>
      </div>
    </div>
  );
}

export function MetricsRail({ data }: MetricsRailProps) {
  const pools = data?.pool_metrics ?? {};
  const quality = data?.quality_metrics ?? { identity_status: 'unknown', acceptance_rate: 0, mean_confidence: 0 };
  const failure = data?.failure_metrics ?? { total_fetches: 0, fallback_count: 0, fallback_rate: 0, blocked_hosts: 0, retry_total: 0, no_progress_streak: 0 };

  const identityBadge = quality.identity_status === 'locked'
    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    : quality.identity_status === 'provisional'
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-3 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
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
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Quality
        </h3>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Identity<Tip text={METRIC_TIPS.identity_status} /></span>
            <span className={`px-1.5 py-0.5 rounded ${identityBadge}`}>{quality.identity_status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Confidence<Tip text={METRIC_TIPS.confidence} /></span>
            <span className="font-mono">{pctString(quality.mean_confidence)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Acceptance<Tip text={METRIC_TIPS.acceptance_rate} /></span>
            <span className="font-mono">{pctString(quality.acceptance_rate)}</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
          Failures
        </h3>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Fallback rate<Tip text={METRIC_TIPS.fallback_rate} /></span>
            <span className="font-mono">{pctString(failure.fallback_rate)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Blocked hosts<Tip text={METRIC_TIPS.blocked_hosts} /></span>
            <span className="font-mono">{failure.blocked_hosts}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">Retries<Tip text={METRIC_TIPS.retries} /></span>
            <span className="font-mono">{failure.retry_total}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-400">No-progress<Tip text={METRIC_TIPS.no_progress} /></span>
            <span className="font-mono">{failure.no_progress_streak}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
