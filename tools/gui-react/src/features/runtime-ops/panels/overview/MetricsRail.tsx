import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { RuntimeOpsMetricsRailData, PoolMetric, CrawlEngineStats } from '../../types.ts';
import { poolBadgeClass, poolMeterFillClass, pctString, METRIC_TIPS } from '../../helpers.ts';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';

interface MetricsRailProps {
  data: RuntimeOpsMetricsRailData | undefined;
}

function PoolCard({ label, pool }: { label: string; pool: PoolMetric }) {
  const total = pool.completed + pool.failed + pool.active + pool.queued;
  const utilization = total > 0 ? (pool.completed + pool.failed) / total : 0;
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
  const scrollRef = usePersistedScroll('scroll:metricsRail');
  const pools = data?.pool_metrics ?? {};
  const failure = data?.failure_metrics ?? { total_fetches: 0, fallback_count: 0, fallback_rate: 0, blocked_hosts: 0, retry_total: 0, no_progress_streak: 0 };
  const engine = data?.crawl_engine;
  const hasEngineData = Boolean(engine && (Object.keys(engine.status_codes).length > 0 || engine.retry_histogram.length > 0));

  return (
    <aside ref={scrollRef} className="w-60 shrink-0 border-r sf-border-default overflow-y-auto p-3 space-y-4">
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
      {engine && hasEngineData && (
        <CrawlEngineSection engine={engine} />
      )}
    </aside>
  );
}

function formatMs(ms: number): string {
  if (ms <= 0) return '0s';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function CrawlEngineSection({ engine }: { engine: CrawlEngineStats }) {
  const codes = Object.entries(engine.status_codes).sort(([a], [b]) => Number(a) - Number(b));
  const totalCodes = codes.reduce((sum, [, count]) => sum + count, 0);
  const histogram = engine.retry_histogram;
  const errors = engine.top_errors.slice(0, 5);

  return (
    <div>
      <h3 className="sf-text-caption font-semibold sf-text-subtle uppercase tracking-wide mb-2">
        Crawl Engine
      </h3>
      <div className="space-y-2 sf-text-caption">
        <div className="flex items-center justify-between">
          <span className="sf-text-muted">Avg OK</span>
          <span className="font-mono">{formatMs(engine.avg_ok_ms)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="sf-text-muted">Avg Fail</span>
          <span className="font-mono">{formatMs(engine.avg_fail_ms)}</span>
        </div>

        {codes.length > 0 && (
          <div>
            <span className="sf-text-muted">Status codes</span>
            <div className="mt-1 space-y-0.5">
              {codes.map(([code, count]) => {
                const pct = totalCodes > 0 ? Math.round((count / totalCodes) * 100) : 0;
                const codeNum = Number(code);
                const barClass = codeNum >= 400 ? 'sf-meter-fill-danger' : 'sf-meter-fill-success';
                return (
                  <div key={code} className="flex items-center gap-1.5">
                    <span className="font-mono w-8 text-right">{code}</span>
                    <div className="flex-1 h-1 sf-meter-track rounded-full">
                      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono w-6 text-right sf-text-muted">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {histogram.length > 0 && (
          <div>
            <span className="sf-text-muted">Retries</span>
            <div className="mt-1 flex gap-1.5 flex-wrap">
              {histogram.map((count, idx) => (
                <span key={idx} className="font-mono sf-text-muted">
                  {idx}r:{count}
                </span>
              ))}
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div>
            <span className="sf-text-muted">Top errors</span>
            <div className="mt-1 space-y-0.5">
              {errors.map(([count, path], idx) => (
                <div key={idx} className="flex gap-1.5">
                  <span className="font-mono sf-text-danger shrink-0">{count}x</span>
                  <span className="sf-text-muted truncate" title={path.join(' > ')}>
                    {path[path.length - 1] ?? path.join(' > ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
