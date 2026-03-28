import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { RuntimeOpsMetricsRailData, PoolMetric, CrawlEngineStats } from '../../types.ts';
import { poolMeterFillClass, METRIC_TIPS } from '../../helpers.ts';
import { resolvePoolStage } from '../../poolStageRegistry.ts';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';

interface MetricsRailProps {
  data: RuntimeOpsMetricsRailData | undefined;
}

const POOL_ORDER = ['llm', 'search', 'fetch', 'parse', 'extraction'] as const;

// WHY: Inline style — Tailwind can't resolve dynamic pool-keyed colors.
const POOL_STRIPE_COLOR: Record<string, string> = {
  llm: 'var(--sf-token-state-warning-fg)',
  search: 'var(--sf-token-accent)',
  fetch: 'var(--sf-token-state-success-fg)',
  parse: 'var(--sf-token-state-info-fg)',
  extraction: 'var(--sf-token-state-confirm-fg)',
};

const POOL_ACTIVE_CLS: Record<string, string> = {
  llm: 'sf-chip-warning',
  search: 'sf-chip-accent',
  fetch: 'sf-chip-success',
  parse: 'sf-chip-info',
  extraction: 'sf-chip-confirm',
};

// WHY: Fetch backend increments `completed` for ALL fetch_finished events (success+fail)
// and `failed` only for error codes ≥400. Other pools track completed/failed separately.
function PoolCounter({ poolKey, pool }: { poolKey: string; pool: PoolMetric }) {
  const base = 'text-[11px] font-bold font-mono sf-text-muted text-right';
  const ls = { letterSpacing: '-0.02em' } as const;

  if (poolKey === 'fetch') {
    const success = Math.max(0, pool.completed - pool.failed);
    return (
      <span className={`${base} min-w-[44px]`} style={ls}>
        {success}<span className="opacity-40"> / </span>{pool.completed}
      </span>
    );
  }

  return (
    <span className={`${base} min-w-[28px]`} style={ls}>{pool.completed}</span>
  );
}

function PoolRow({ poolKey, pool }: { poolKey: string; pool: PoolMetric }) {
  const done = pool.completed + pool.failed;
  const total = done + pool.active + pool.queued;
  const widthPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const vis = resolvePoolStage(poolKey);
  const tipKey = `pool_${poolKey}` as keyof typeof METRIC_TIPS;
  const hasActive = pool.active > 0;

  return (
    <div className="flex items-stretch rounded-lg transition-colors sf-hover-bg-surface-soft">
      <div
        className="w-[3px] shrink-0 rounded-l-lg"
        style={{ background: POOL_STRIPE_COLOR[poolKey] ?? 'var(--sf-token-border-default)', opacity: hasActive ? 1 : 0.55 }}
      />
      <div className="flex-1 py-2.5 pl-3 pr-2.5">
        <div className="flex items-center mb-1.5 h-5">
          <span className="text-[12px] font-bold sf-text-primary flex-1 tracking-tight">
            {vis.shortLabel}
            <Tip text={METRIC_TIPS[tipKey] ?? ''} />
          </span>
          {hasActive && (
            <span className={`text-[10px] font-extrabold font-mono min-w-[22px] h-[18px] inline-flex items-center justify-center rounded-full animate-pulse ${POOL_ACTIVE_CLS[poolKey] ?? 'sf-chip-neutral'}`}>
              {pool.active}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 sf-meter-track rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${poolMeterFillClass(poolKey)}`}
              style={{ width: `${widthPct}%` }}
            />
          </div>
          <PoolCounter poolKey={poolKey} pool={pool} />
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
    <aside ref={scrollRef} className="w-[220px] shrink-0 border-r sf-border-default overflow-y-auto sf-surface-shell flex flex-col">
      <div className="px-4 pt-3 pb-1">
        <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle">
          Pipeline
        </h3>
      </div>
      <div className="px-2 pb-2 flex flex-col gap-px">
        {POOL_ORDER.map((key) => (
          <PoolRow
            key={key}
            poolKey={key}
            pool={pools[key] ?? { active: 0, queued: 0, completed: 0, failed: 0 }}
          />
        ))}
      </div>

      {engine && hasEngineData && (
        <>
          <div className="h-px sf-border-soft mx-4" />
          <CrawlEngineSection engine={engine} />
        </>
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
    <div className="px-4 py-3">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-2.5">
        Crawl Engine
      </h3>
      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        <div>
          <div className="text-[10px] sf-text-subtle">Avg OK</div>
          <div className="text-[14px] font-extrabold font-mono sf-text-primary" style={{ letterSpacing: '-0.03em' }}>{formatMs(engine.avg_ok_ms)}</div>
        </div>
        <div>
          <div className="text-[10px] sf-text-subtle">Avg Fail</div>
          <div className="text-[14px] font-extrabold font-mono sf-text-danger" style={{ letterSpacing: '-0.03em' }}>{formatMs(engine.avg_fail_ms)}</div>
        </div>
      </div>

      {codes.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] sf-text-subtle mb-1">Status codes</div>
          <div className="space-y-0.5">
            {codes.map(([code, count]) => {
              const pct = totalCodes > 0 ? Math.round((count / totalCodes) * 100) : 0;
              const codeNum = Number(code);
              const barClass = codeNum >= 400 ? 'sf-meter-fill-danger' : 'sf-meter-fill-success';
              return (
                <div key={code} className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] w-8 text-right sf-text-muted">{code}</span>
                  <div className="flex-1 h-1 sf-meter-track rounded-full">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-[10px] w-6 text-right sf-text-muted">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {histogram.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] sf-text-subtle mb-1">Retries</div>
          <div className="flex gap-1.5 flex-wrap">
            {histogram.map((count, idx) => (
              <span key={idx} className="font-mono text-[10px] sf-text-muted">{idx}r:{count}</span>
            ))}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] sf-text-subtle mb-1">Top errors</div>
          <div className="space-y-0.5">
            {errors.map(([count, path], idx) => (
              <div key={idx} className="flex gap-1.5 text-[10px]">
                <span className="font-mono sf-text-danger shrink-0">{count}x</span>
                <span className="sf-text-muted truncate" title={path.join(' > ')}>{path[path.length - 1] ?? path.join(' > ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
