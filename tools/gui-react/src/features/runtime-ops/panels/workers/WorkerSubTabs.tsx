import { useMemo } from 'react';
import type { RuntimeOpsWorkerRow } from '../../types';
import { poolDotClass, poolSelectedTabClass, poolOutlineTabClass, workerStateBadgeClass } from '../../helpers';
import { resolvePoolStage } from '../../poolStageRegistry';
import { buildWorkerButtonLabel, buildWorkerButtonSubtitle, sortWorkersForTabs } from '../../selectors/workerTabHelpers.js';
import { SearchProviderIcon } from '../../../../shared/ui/icons/SearchProviderIcon';

interface WorkerSubTabsProps {
  workers: RuntimeOpsWorkerRow[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
  poolFilter: string;
}

// WHY: UI-specific display order — not all pools are shown, and the order differs from POOL_STAGE_KEYS.
const POOL_ORDER: ReadonlyArray<string> = ['llm', 'search', 'fetch'];

function stateAnimClass(state: string): string {
  switch (state) {
    case 'stuck': return 'animate-pulse';
    case 'running': return 'animate-dot-bounce';
    case 'queued': return '';
    default: return '';
  }
}

interface PoolGroup {
  pool: string;
  meta: { shortLabel: string; laneClass: string; labelClass: string; tintClass: string };
  workers: RuntimeOpsWorkerRow[];
  runningCount: number;
}

export function WorkerSubTabs({ workers, selectedWorkerId, onSelectWorker, poolFilter }: WorkerSubTabsProps) {
  const grouped = useMemo((): PoolGroup[] => {
    const list = poolFilter === 'all' ? workers : workers.filter((w) => w.pool === poolFilter);
    const groups: PoolGroup[] = [];
    for (const pool of POOL_ORDER) {
      const poolWorkers = sortWorkersForTabs(list.filter((w) => w.pool === pool));
      if (poolWorkers.length > 0) {
        const vis = resolvePoolStage(pool);
        groups.push({
          pool,
          meta: vis,
          workers: poolWorkers,
          runningCount: poolWorkers.filter((w) => w.state === 'running').length,
        });
      }
    }
    const otherWorkers = sortWorkersForTabs(list.filter((w) => !POOL_ORDER.includes(w.pool)));
    if (otherWorkers.length > 0) {
      const fallback = resolvePoolStage('other');
      groups.push({ pool: 'other', meta: fallback, workers: otherWorkers, runningCount: 0 });
    }
    return groups;
  }, [workers, poolFilter]);

  if (grouped.length === 0) return null;

  return (
    <div className="border-b sf-border-default">
      {grouped.map((group, i) => (
        <div
          key={group.pool}
          className={`flex items-stretch border-l-[3px] ${group.meta.laneClass} ${group.meta.tintClass} ${i > 0 ? 'border-t sf-border-default' : ''}`}
        >
          {/* ── Lane sidebar ── */}
          <div className="flex items-center gap-2.5 pl-3 pr-4 py-2 shrink-0">
            <span className={`sf-text-caption font-bold uppercase tracking-widest ${group.meta.labelClass} select-none`}>
              {group.meta.shortLabel}
            </span>
            <span className="sf-text-nano font-mono tabular-nums sf-text-muted leading-none">
              {group.runningCount > 0
                ? <><span className="sf-text-success font-semibold">{group.runningCount}</span><span className="opacity-40"> / </span>{group.workers.length}</>
                : group.workers.length}
            </span>
          </div>

          {/* ── Worker buttons ── */}
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 py-2 pr-3">
            {group.workers.map((w) => {
              const isSelected = w.worker_id === selectedWorkerId;
              const subtitle = buildWorkerButtonSubtitle(w);

              const isQueued = w.state === 'queued';

              return (
                <button
                  key={w.worker_id}
                  type="button"
                  onClick={isQueued ? undefined : () => onSelectWorker(w.worker_id)}
                  disabled={isQueued}
                  className={`sf-prefetch-tab-button flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-all ${
                    isQueued
                      ? 'opacity-60 cursor-default'
                      : isSelected
                        ? `sf-prefetch-tab-selected ${poolSelectedTabClass(w.pool)} shadow-sm`
                        : `${poolOutlineTabClass(w.pool)} hover:shadow-sm`
                  }`}
                  title={`${w.worker_id} — ${w.state}${w.pool === 'llm' && w.call_type ? ` — ${w.call_type}` : ''}${w.pool === 'search' && w.current_query ? ` — ${w.current_query}` : ''}`}
                >
                  <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${poolDotClass(w.pool)} ${stateAnimClass(w.state)}`} />
                  <span className="flex flex-col items-start leading-tight">
                    <span className="font-mono font-medium sf-text-primary">
                      {buildWorkerButtonLabel(w)}
                    </span>
                    {subtitle && (
                      <span className="sf-text-nano sf-text-muted max-w-[10rem] truncate">
                        {subtitle}
                      </span>
                    )}
                  </span>
                  {w.pool === 'search' && (w.current_provider ?? w.last_provider) && (
                    <SearchProviderIcon provider={(w.current_provider ?? w.last_provider)!} size={14} className="sf-text-muted shrink-0 opacity-70" />
                  )}
                  {w.state === 'stuck' && (
                    <span className={`px-1 py-0 rounded sf-text-nano font-semibold ${workerStateBadgeClass('stuck')}`}>
                      STUCK
                    </span>
                  )}
                  {isQueued && (
                    <span className={`px-1 py-0 rounded sf-text-nano font-semibold ${workerStateBadgeClass('queued')}`}>
                      QUEUED
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
