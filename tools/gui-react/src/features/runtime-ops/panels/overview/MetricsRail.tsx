import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { RuntimeOpsMetricsRailData, PoolMetric, CrawlEngineStats } from '../../types.ts';
import { poolMeterFillClass, METRIC_TIPS } from '../../helpers.ts';
import { resolvePoolStage } from '../../poolStageRegistry.ts';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';

interface MetricsRailProps {
  data: RuntimeOpsMetricsRailData | undefined;
}

// WHY: Pipeline display order — matches the conceptual flow from planning to output.
const POOL_ORDER = ['llm', 'search', 'fetch', 'parse', 'extraction'] as const;

function PoolRow({ poolKey, pool }: { poolKey: string; pool: PoolMetric }) {
  const total = pool.completed + pool.failed + pool.active + pool.queued;
  const widthPct = total > 0 ? Math.round(((pool.completed + pool.failed) / total) * 100) : 0;
  const vis = resolvePoolStage(poolKey);
  const tipKey = `pool_${poolKey}` as keyof typeof METRIC_TIPS;
  const hasActive = pool.active > 0;
  const hasFail = pool.failed > 0;

  return (
    <div className="group px-2 py-1.5 rounded transition-colors sf-hover-bg-surface-soft">
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${vis.dot} ${hasActive ? 'animate-pulse' : ''}`} />
        <span className="sf-text-caption font-semibold uppercase tracking-wider sf-text-primary flex-1">
          {vis.shortLabel}
          <Tip text={METRIC_TIPS[tipKey] ?? ''} />
        </span>
        {hasActive && (
          <span className={`sf-text-nano font-mono font-semibold ${vis.activeCount}`}>
            {pool.active}
          </span>
        )}
      </div>

      <div className="ml-4">
        <div className="h-1 sf-meter-track rounded-full mb-1">
          <div
            className={`h-full rounded-full transition-all ${poolMeterFillClass(poolKey)}`}
            style={{ width: `${widthPct}%` }}
          />
        </div>
        <div className="flex items-center gap-1 sf-text-nano sf-text-muted font-mono">
          <span>{pool.completed}</span>
          {hasFail && (
            <>
              <span className="opacity-40">/</span>
              <span className="sf-text-danger">{pool.failed}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function MetricsRail({ data }: MetricsRailProps) {
  const scrollRef = usePersistedScroll('scroll:metricsRail');
  const pools = data?.pool_metrics ?? {};
  const engine = data?.crawl_engine;
  const hasEngineData = Boolean(engine && (Object.keys(engine.status_codes).length > 0 || engine.retry_histogram.length > 0));

  return (
    <aside ref={scrollRef} className="w-52 shrink-0 border-r sf-border-default overflow-y-auto p-2 space-y-3">
      <div>
        <h3 className="sf-text-nano font-semibold sf-text-subtle uppercase tracking-widest px-2 mb-1">
          Pipeline
        </h3>
        <div className="space-y-0.5">
          {POOL_ORDER.map((key) => (
            <PoolRow
              key={key}
              poolKey={key}
              pool={pools[key] ?? { active: 0, queued: 0, completed: 0, failed: 0 }}
            />
          ))}
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
    <div className="px-2">
      <h3 className="sf-text-nano font-semibold sf-text-subtle uppercase tracking-widest mb-1">
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
