import { useMemo, useState, useEffect } from 'react';
import type { RuntimeOpsWorkerRow } from '../../types.ts';
import { poolDotClass, poolSelectedTabClass, poolOutlineTabClass, workerStateBadgeClass } from '../../helpers.ts';
import { resolvePoolStage } from '../../poolStageRegistry.ts';
import { buildWorkerButtonLabel, buildWorkerButtonSubtitle, sortWorkersForTabs } from '../../selectors/workerTabHelpers.js';
import { SearchProviderIcon } from '../../../../shared/ui/icons/SearchProviderIcon.tsx';
import { accessBadgeClass, accessBadgeLabel } from '../../selectors/llmModelHelpers.ts';
import { parseBackendMs } from '../../../../utils/dateTime.ts';

interface WorkerSubTabsProps {
  workers: RuntimeOpsWorkerRow[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
}

// WHY: UI-specific display order — not all pools are shown, and the order differs from POOL_STAGE_KEYS.
const POOL_ORDER: ReadonlyArray<string> = ['llm', 'search', 'fetch'];

// WHY: O(1) badge label map — states map to Crawlee's RequestState enum.
// Error sub-reasons shown via REASON_LABEL in the detail panel, not here.
const BADGE_LABEL: Readonly<Record<string, string>> = {
  stuck: 'STUCK', crawling: 'CRAWLING', crawled: 'CRAWLED',
  failed: 'FAILED', retrying: 'RETRY', queued: 'QUEUED',
  running: 'RUNNING', skipped: 'SKIPPED', idle: 'IDLE',
};

// WHY: Map block_reason / error messages to short human-readable badge labels.
const REASON_LABEL: Readonly<Record<string, string>> = {
  empty_response: 'EMPTY', server_error: '5XX', no_response: 'TIMEOUT',
  status_403: '403', status_429: '429', robots_blocked: 'ROBOTS',
  captcha_detected: 'CAPTCHA', cloudflare_challenge: 'CLOUDFLARE',
  access_denied: 'DENIED',
};

function formatErrorLabel(error: string): string {
  if (!error) return 'FAILED';
  // Clean block_reason value (no prefix)
  if (REASON_LABEL[error]) return REASON_LABEL[error];
  // Prefixed error from last_error
  if (error.startsWith('blocked:')) {
    const reason = error.slice(8);
    return REASON_LABEL[reason] || reason.replace(/_/g, ' ').toUpperCase().slice(0, 12);
  }
  if (error.includes('Download is starting')) return 'DOWNLOAD';
  if (error.includes('ERR_NAME_NOT_RESOLVED')) return 'DNS';
  if (error.includes('ERR_CONNECTION_REFUSED')) return 'REFUSED';
  if (error.includes('ERR_CONNECTION_RESET')) return 'RESET';
  if (error.includes('Navigation timed out')) return 'NAV TIMEOUT';
  if (error.includes('requestHandler timed out')) return 'SLOW PAGE';
  if (error.includes('timed out')) return 'TIMEOUT';
  const httpMatch = error.match(/^HTTP (\d+)$/);
  if (httpMatch) return httpMatch[1];
  // WHY: Truncate unknown errors but keep them readable — no all-caps garble.
  const clean = error.replace(/^Error:\s*/i, '').trim();
  return clean.length > 14 ? `${clean.slice(0, 12)}..` : clean.toUpperCase();
}

// WHY: Map error content to the appropriate badge severity class.
function errorBadgeClass(error: string): string {
  const lower = (error || '').toLowerCase();
  if (lower.includes('captcha') || lower.includes('cloudflare')) return 'sf-chip-danger';
  if (lower.includes('403') || lower.includes('blocked') || lower.includes('denied')) return 'sf-chip-warning';
  if (lower.includes('429')) return 'sf-chip-warning';
  return 'sf-chip-danger';
}

function primaryBadgeForWorker(w: RuntimeOpsWorkerRow): { label: string; cls: string } | null {
  // WHY: For retrying/failed, show the specific error from Crawlee instead of generic label.
  if (w.state === 'retrying' || w.state === 'failed') {
    const label = formatErrorLabel(w.last_error || '');
    return { label, cls: workerStateBadgeClass(w.state) };
  }
  const label = BADGE_LABEL[w.state];
  if (!label) return null;
  return { label, cls: workerStateBadgeClass(w.state) };
}

function WorkerBadgeStack({ worker }: { worker: RuntimeOpsWorkerRow }) {
  const primary = primaryBadgeForWorker(worker);
  const isRetrying = worker.state === 'retrying';
  const bdUnlocked = Boolean(worker.bright_data_unlocked);
  if (!primary && !isRetrying && !bdUnlocked) return null;
  return (
    <div className="flex flex-col gap-0.5 items-end shrink-0">
      {primary && (
        <span className={`px-1 py-0 rounded sf-text-nano font-semibold ${primary.cls}`}>
          {primary.label}
        </span>
      )}
      {isRetrying && worker.started_at && (
        <span className="px-1 py-0 rounded sf-text-nano font-semibold sf-chip-info animate-pulse whitespace-nowrap">
          RETRY <TabTimer startTs={worker.started_at} />
        </span>
      )}
      {bdUnlocked && (
        <span className="px-1 py-0 rounded sf-text-nano font-bold tracking-wide sf-chip-accent whitespace-nowrap" title="Unlocked via Bright Data Web Unlocker API">
          BRIGHTDATA
        </span>
      )}
    </div>
  );
}

function TabTimer({ startTs }: { startTs: string }) {
  const [elapsed, setElapsed] = useState(() => {
    const start = parseBackendMs(startTs);
    return Number.isFinite(start) ? Math.max(0, Math.round((Date.now() - start) / 1000)) : 0;
  });
  useEffect(() => {
    const start = parseBackendMs(startTs);
    if (!Number.isFinite(start)) return;
    const id = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000))), 1000);
    return () => clearInterval(id);
  }, [startTs]);
  return <span className="sf-text-nano font-mono sf-text-muted">{elapsed}s</span>;
}

// WHY: Countdown from handler timeout budget so you know when the retry will give up.
function CountdownTimer({ startTs, budgetSecs }: { startTs: string; budgetSecs: number }) {
  const [remaining, setRemaining] = useState(() => {
    const start = parseBackendMs(startTs);
    if (!Number.isFinite(start)) return budgetSecs;
    return Math.max(0, budgetSecs - Math.round((Date.now() - start) / 1000));
  });
  useEffect(() => {
    const start = parseBackendMs(startTs);
    if (!Number.isFinite(start)) return;
    const id = setInterval(() => {
      setRemaining(Math.max(0, budgetSecs - Math.round((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [startTs, budgetSecs]);
  return <span className="sf-text-nano font-mono">{remaining}s</span>;
}

// WHY: Active states that should show a live ticking timer.
const LIVE_TIMER_STATES = new Set(['running', 'crawling', 'retrying', 'stuck']);

function WorkerTimer({ worker }: { worker: RuntimeOpsWorkerRow }) {
  if (LIVE_TIMER_STATES.has(worker.state) && worker.started_at) {
    return <TabTimer startTs={worker.started_at} />;
  }
  const dur = worker.duration_ms ?? (worker.elapsed_ms > 0 ? worker.elapsed_ms : 0);
  if (dur > 0) {
    return <span className="sf-text-nano font-mono sf-text-muted">{(dur / 1000).toFixed(1)}s</span>;
  }
  return null;
}

const STATE_ANIM: Record<string, string> = {
  stuck: 'animate-pulse',
  running: 'animate-dot-bounce',
  crawling: 'animate-dot-bounce',
  retrying: 'animate-pulse',
};

function stateAnimClass(state: string): string {
  return STATE_ANIM[state] ?? '';
}

interface PoolGroup {
  pool: string;
  meta: { shortLabel: string; laneClass: string; labelClass: string; tintClass: string };
  workers: RuntimeOpsWorkerRow[];
  runningCount: number;
}

export function WorkerSubTabs({ workers, selectedWorkerId, onSelectWorker }: WorkerSubTabsProps) {
  const grouped = useMemo((): PoolGroup[] => {
    const groups: PoolGroup[] = [];
    // WHY: Always show all pool groups — even empty ones get placeholder rows
    // so the user sees the full pipeline layout before workers fire.
    for (const pool of POOL_ORDER) {
      const poolWorkers = sortWorkersForTabs(workers.filter((w) => w.pool === pool));
      const vis = resolvePoolStage(pool);
      groups.push({
        pool,
        meta: vis,
        workers: poolWorkers,
        runningCount: poolWorkers.filter((w) => w.state === 'running' || w.state === 'crawling' || w.state === 'retrying').length,
      });
    }
    const otherWorkers = sortWorkersForTabs(workers.filter((w) => !POOL_ORDER.includes(w.pool)));
    if (otherWorkers.length > 0) {
      const fallback = resolvePoolStage('other');
      groups.push({ pool: 'other', meta: fallback, workers: otherWorkers, runningCount: 0 });
    }
    return groups;
  }, [workers]);

  if (grouped.length === 0) return null;

  return (
    <div className="border-b sf-border-default">
      {grouped.map((group, i) => (
        <div
          key={group.pool}
          className={`flex items-stretch border-l-[3px] ${group.meta.laneClass} ${group.meta.tintClass} ${i > 0 ? 'border-t sf-border-soft' : ''} h-[46px]`}
        >
          {/* ── Lane sidebar ── */}
          <div className="flex items-center gap-2 pl-3 pr-4 shrink-0 min-w-[96px]">
            <span className={`text-[10px] font-bold uppercase tracking-[0.05em] ${group.meta.labelClass} select-none`}>
              {group.meta.shortLabel}
            </span>
            <span className="text-[9px] font-mono tabular-nums sf-text-muted leading-none">
              {group.runningCount > 0
                ? <><span className="sf-text-success font-semibold">{group.runningCount}</span><span className="opacity-40"> / </span>{group.workers.length}</>
                : group.workers.length}
            </span>
          </div>

          {/* ── Worker buttons ── */}
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 pr-4">
            {group.workers.length === 0 && (
              <span className="text-[11px] sf-text-muted italic">Waiting…</span>
            )}
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
                  className={`sf-prefetch-tab-button flex items-center gap-2 h-[34px] px-2.5 rounded-lg text-xs whitespace-nowrap border transition-all ${
                    isQueued
                      ? 'opacity-30 cursor-default'
                      : isSelected
                        ? `sf-prefetch-tab-selected ${poolSelectedTabClass(w.pool)} shadow-sm`
                        : `${poolOutlineTabClass(w.pool)} hover:shadow-sm`
                  }`}
                  title={`${w.worker_id} — ${w.state}${w.pool === 'llm' && w.call_type ? ` — ${w.call_type}` : ''}${w.pool === 'search' && w.current_query ? ` — ${w.current_query}` : ''}`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${poolDotClass(w.pool)} ${stateAnimClass(w.state)}`} />
                  <span className="flex flex-col items-start justify-center leading-tight">
                    <span className="font-mono font-medium sf-text-primary">
                      {buildWorkerButtonLabel(w)}
                    </span>
                    {subtitle && (
                      <span className="sf-text-nano sf-text-muted max-w-[10rem] truncate">
                        {subtitle}
                      </span>
                    )}
                  </span>
                  {w.pool === 'search' && w.current_provider && (
                    <SearchProviderIcon provider={w.current_provider} size={14} className="sf-text-muted shrink-0 opacity-70" />
                  )}
                  {w.pool === 'llm' && (
                    <span className={`px-1 py-0 rounded sf-text-nano font-bold uppercase tracking-wider ${accessBadgeClass(Boolean(w.is_lab))}`}>
                      {accessBadgeLabel(Boolean(w.is_lab))}
                    </span>
                  )}
                  {w.state !== 'retrying' && <WorkerTimer worker={w} />}
                  <WorkerBadgeStack worker={w} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
