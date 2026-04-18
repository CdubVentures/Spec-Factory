import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import { formatMs, getRefetchInterval, serpSelectorDecisionBadgeClass } from '../../helpers.ts';
import { providerDisplayLabel, resolveDecisionDisplay } from '../../selectors/searchResultsHelpers.js';
import type { RuntimeOpsWorkerRow, WorkerDetailResponse, SearchWorkerAttempt, SearchResultEntry, PrefetchTabKey } from '../../types.ts';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import {
  getProviderColors, searchStatusLabel, stateBadgeContent, attemptLabel,
  computeSearchStats, buildSearchNarrative, computeProviderUsage, computeTriageSummary,
} from './searchWorkerHelpers.ts';
import { useFormatTime } from '../../../../utils/dateTime.ts';

// ── Props ────────────────────────────────────────────────────────────────────

interface SearchWorkerPanelProps {
  runId: string;
  worker: RuntimeOpsWorkerRow;
  isRunning: boolean;
  category: string;
  onOpenQueryJourney: () => void;
  onOpenSearchResults: () => void;
  onOpenPrefetchTab: (tab: PrefetchTabKey | null) => void;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SearchWorkerPanel({
  runId, worker, isRunning, category,
  onOpenQueryJourney, onOpenSearchResults, onOpenPrefetchTab: _onOpenPrefetchTab,
}: SearchWorkerPanelProps) {
  const [expandedRows, toggleExpandedRow] = usePersistedExpandMap(`runtimeOps:searchDash:expanded:${category}`);
  const heroScrollRef = usePersistedScroll(`scroll:searchDash:hero:${category}`);
  const tableScrollRef = usePersistedScroll(`scroll:searchDash:table:${category}`);

  const { data } = useQuery({
    queryKey: ['runtime-ops', runId, 'search-worker-panel', worker.worker_id],
    queryFn: () => api.get<WorkerDetailResponse>(`/indexlab/run/${runId}/runtime/workers/${encodeURIComponent(worker.worker_id)}`),
    enabled: Boolean(runId && worker.worker_id),
    refetchInterval: getRefetchInterval(isRunning, false, 3000, 15000),
  });

  const attempts = data?.search_history ?? [];
  const latestAttempt = attempts[0] ?? null;
  const activeProvider = String(worker.current_provider ?? latestAttempt?.provider ?? '').trim();
  const activeQuery = String(worker.current_query ?? latestAttempt?.query ?? '').trim();
  const slotLabel = worker.slot ?? '?';

  const isWorkerRunning = worker.state === 'running';
  const isWorkerStuck = worker.state === 'stuck';

  const stats = useMemo(() => computeSearchStats(attempts, worker), [attempts, worker]);
  const narrative = useMemo(() => buildSearchNarrative(stats, activeProvider, formatMs), [stats, activeProvider]);
  const providerUsage = useMemo(() => computeProviderUsage(attempts), [attempts]);
  const badge = stateBadgeContent(worker.state);

  const stepsData = useMemo(() => [
    { label: 'Assigned', note: `slot ${slotLabel} \u00B7 ${stats.started} tasks`, isActive: false, isDone: true },
    { label: 'Executing', note: activeProvider || 'no provider', isActive: isWorkerRunning, isDone: !isWorkerRunning && stats.completed > 0 },
    { label: 'Results', note: `${stats.completed} done \u00B7 ${stats.avgResults.toFixed(1)} avg`, isActive: false, isDone: stats.completed > 0 },
  ], [slotLabel, stats, activeProvider, isWorkerRunning]);

  const primaryCount = attempts.filter((a) => a.attempt_type === 'primary').length;
  const fallbackCount = attempts.filter((a) => a.attempt_type === 'fallback').length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={heroScrollRef} className="shrink-0 overflow-y-auto max-h-[55vh] p-4 pb-0 space-y-4">
        <HeroBand
          titleRow={<>
            <span className="text-[26px] font-bold sf-text-primary">Search Worker</span>
            <span className="text-[20px] sf-text-muted italic">&middot; Slot {slotLabel}</span>
            {badge.pulse ? (
              <Chip label={badge.label} className="sf-chip-success animate-pulse" />
            ) : (
              <Chip label={badge.label} className={badge.chipClass} />
            )}
          </>}
          trailing={<>
            <ProviderPill provider={activeProvider} />
            <Chip label={worker.worker_id} className="sf-chip-neutral" />
            <button type="button" onClick={onOpenQueryJourney} className="px-2 py-1 rounded sf-text-caption font-medium sf-icon-button border sf-border-soft">
              Query Journey
            </button>
            <button type="button" onClick={onOpenSearchResults} className="px-2 py-1 rounded sf-text-caption font-medium sf-primary-button">
              Search Results
            </button>
          </>}
          footer={<>
            <span>Worker ID: <strong className="sf-text-primary">{worker.worker_id}</strong></span>
            <span>Slot: <strong className="sf-text-primary">{slotLabel}</strong></span>
            <span>Primary: <strong className="sf-text-primary">{primaryCount}</strong></span>
            <span>Fallback: <strong className="sf-text-primary">{fallbackCount}</strong></span>
            <span>Total URLs fetched: <strong className="sf-text-primary">{attempts.reduce((s, a) => s + a.results.filter((r) => r.fetched).length, 0)}</strong></span>
          </>}
        >
          <RuntimeIdxBadgeStrip badges={worker.idx_runtime} />

          <HeroStatGrid columns={6}>
            <HeroStat value={stats.started} label="started" />
            <HeroStat value={stats.completed} label="completed" colorClass="text-[var(--sf-token-state-success-fg)]" />
            <HeroStat value={stats.zeroResults} label="zero results" colorClass={stats.zeroResults > 0 ? 'text-[var(--sf-token-state-warning-fg)]' : 'sf-text-primary'} />
            <HeroStat value={stats.avgLatencyMs > 0 ? formatMs(stats.avgLatencyMs) : '\u2014'} label="avg latency" colorClass="sf-text-primary" />
            <HeroStat value={stats.avgResults.toFixed(1)} label="avg res / q" colorClass="text-[var(--sf-token-state-info-fg)]" />
            <HeroStat value={stats.totalResults} label="total results" colorClass="sf-text-primary" />
          </HeroStatGrid>

          <div className="text-sm sf-text-muted italic max-w-3xl">
            Completed <strong className="sf-text-primary not-italic">{narrative.completed}</strong> of{' '}
            <strong className="sf-text-primary not-italic">{narrative.started}</strong> search attempts via{' '}
            <strong className="sf-text-primary not-italic">{narrative.provider}</strong>.{' '}
            {narrative.zeroResults > 0 && <><strong className="sf-text-primary not-italic">{narrative.zeroResults}</strong> returned zero results. </>}
            Average <strong className="sf-text-primary not-italic">{narrative.avgResults}</strong> results per query
            with <strong className="sf-text-primary not-italic">{narrative.avgLatency}</strong> avg latency.
          </div>

          {/* Visuals row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CurrentQueryCard
              query={activeQuery}
              isRunning={isWorkerRunning}
              isStuck={isWorkerStuck}
              worker={worker}
            />
            <ProviderUsageCard usage={providerUsage} />
            <StoryStripCard steps={stepsData} isStuck={isWorkerStuck} />
          </div>
        </HeroBand>
      </div>

      <div ref={tableScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 pt-4">
        <AttemptsSection
          attempts={attempts}
          expandedRows={expandedRows}
          onToggleRow={toggleExpandedRow}
          onJourney={onOpenQueryJourney}
          onResults={onOpenSearchResults}
          workerId={worker.worker_id}
          hasData={Boolean(data)}
          category={category}
        />
      </div>
    </div>
  );
}

// ── Current Query Card ───────────────────────────────────────────────────────

function CurrentQueryCard({ query, isRunning, isStuck, worker }: {
  query: string; isRunning: boolean; isStuck: boolean; worker: RuntimeOpsWorkerRow;
}) {
  const borderClass = isStuck ? 'border-[var(--sf-token-state-warning-fg)]' : query ? 'border-[var(--sf-token-accent)]' : 'sf-border-soft';
  return (
    <div className={`sf-surface-panel rounded-lg p-4 border ${borderClass}`}
      style={query ? { background: isStuck ? 'rgba(234,179,8,0.04)' : 'rgba(99,102,241,0.04)' } : undefined}
    >
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-dim mb-2">Current Query</div>
      <div className="font-mono text-[13px] break-all leading-relaxed" style={{ color: isStuck ? 'var(--sf-token-state-warning-fg)' : query ? 'var(--sf-token-accent)' : undefined }}>
        {isRunning && query && <span className="sf-blink mr-1" style={{ color: 'var(--sf-token-accent)' }}>{'\u258C'}</span>}
        {query || 'No active query'}
      </div>
      <div className="mt-2 flex gap-4 text-xs sf-text-dim">
        <span>Results: <span className="font-mono font-medium sf-text-muted">{worker.last_result_count ?? 0}</span></span>
        <span>Duration: <span className="font-mono font-medium sf-text-muted">{formatMs(worker.last_duration_ms ?? 0)}</span></span>
        {(isRunning || isStuck) && worker.elapsed_ms > 0 && (
          <span>Elapsed: <span className={`font-mono font-medium ${worker.elapsed_ms > 10000 ? 'text-[var(--sf-token-state-warning-fg)]' : 'sf-text-muted'}`}>{formatMs(worker.elapsed_ms)}</span></span>
        )}
      </div>
      {isStuck && <div className="mt-2 text-xs font-medium text-[var(--sf-token-state-warning-fg)]">{'\u26A0'} Worker may be stalled</div>}
      {worker.last_error && <div className="mt-2 text-xs font-medium sf-chip-danger px-2 py-1 rounded inline-block">{'\u2717'} {worker.last_error}</div>}
    </div>
  );
}

// ── Provider Usage Card ──────────────────────────────────────────────────────

function ProviderUsageCard({ usage }: { usage: Array<{ provider: string; queries: number; results: number }> }) {
  return (
    <div className="sf-surface-panel rounded-lg p-4 border sf-border-soft">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-dim mb-3">Provider Usage</div>
      {usage.map((u) => (
        <div key={u.provider} className="flex items-center gap-2 py-1.5 border-b sf-border-soft last:border-b-0">
          <ProviderPill provider={u.provider} />
          <span className="text-[11px] sf-text-dim">{u.queries} queries</span>
          <span className="ml-auto text-[11px] font-mono font-bold sf-text-primary">{u.results} results</span>
        </div>
      ))}
      {usage.length === 0 && <span className="text-[11px] sf-text-dim">no queries yet</span>}
    </div>
  );
}

// ── Story Strip Card ─────────────────────────────────────────────────────────

function StoryStripCard({ steps, isStuck }: { steps: Array<{ label: string; note: string; isActive: boolean; isDone: boolean }>; isStuck: boolean }) {
  return (
    <div className="sf-surface-panel rounded-lg p-4 border sf-border-soft flex flex-col justify-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-dim mb-3">Pipeline Progress</div>
      <div className="flex items-center gap-2">
        {steps.map((step, i) => (
          <div key={step.label} className="contents">
            <StoryCard label={step.label} note={step.note} isActive={step.isActive} isDone={step.isDone} isStuck={isStuck} />
            {i < steps.length - 1 && <span className="sf-text-dim text-sm shrink-0">{'\u2192'}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function StoryCard({ label, note, isActive, isDone, isStuck }: {
  label: string; note: string; isActive: boolean; isDone: boolean; isStuck: boolean;
}) {
  const done = isDone && !isActive;
  const stuckActive = isActive && isStuck;
  const borderStyle = isActive
    ? (stuckActive ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(var(--sf-color-accent-rgb) / 0.4)')
    : done ? '1px solid rgba(var(--sf-color-accent-rgb) / 0.2)' : undefined;
  const bgStyle = isActive
    ? (stuckActive ? 'rgba(245,158,11,0.04)' : 'rgba(var(--sf-color-accent-rgb) / 0.04)') : undefined;

  return (
    <div className={`flex-1 rounded-lg p-2.5 ${!isActive && !done ? 'sf-surface-card sf-border-soft border' : 'sf-surface-card'}`}
      style={{ ...(borderStyle ? { border: borderStyle } : {}), ...(bgStyle ? { background: bgStyle } : {}) }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{
            borderWidth: '1.5px', borderStyle: 'solid',
            borderColor: (isActive || done) ? 'rgba(var(--sf-color-accent-rgb))' : 'var(--sf-token-border-subtle)',
            color: (isActive || done) ? 'rgba(var(--sf-color-accent-rgb))' : 'var(--sf-token-text-dim)',
            background: done ? 'rgba(var(--sf-color-accent-rgb) / 0.1)' : undefined,
          }}
        >
          {isActive ? '\u21BB' : done ? '\u2713' : ''}
        </div>
        <span className={`text-[11px] ${isActive ? 'font-semibold sf-text-primary' : done ? 'font-medium sf-text-primary' : 'sf-text-muted'}`}>{label}</span>
      </div>
      <div className="text-[10px] sf-text-dim font-mono pl-[22px]">{note}</div>
    </div>
  );
}

// ── Provider Pill ────────────────────────────────────────────────────────────

function ProviderPill({ provider }: { provider: string }) {
  const label = providerDisplayLabel(provider) || provider || '\u2014';
  const colors = getProviderColors(provider);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold whitespace-nowrap"
      style={{ color: colors.text, background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      {label}
    </span>
  );
}

// ── Attempts Section ─────────────────────────────────────────────────────────

function AttemptsSection({ attempts, expandedRows, onToggleRow, onJourney, onResults, workerId, hasData, category }: {
  attempts: SearchWorkerAttempt[];
  expandedRows: Record<string, boolean>;
  onToggleRow: (id: string) => void;
  onJourney: () => void;
  onResults: () => void;
  workerId: string;
  hasData: boolean;
  category: string;
}) {
  const completed = attempts.filter((a) => a.status === 'done' || a.status === 'zero').length;
  return (
    <div className="sf-table-shell rounded overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 sf-table-head border-b sf-border-soft">
        <div className="flex items-center gap-2">
          <span className="sf-table-head-cell p-0 border-0 text-sm font-semibold">Search Attempts</span>
          <span className="sf-table-head-cell p-0 border-0 font-normal">{attempts.length} queries &middot; {completed} completed</span>
        </div>
        <span className="sf-table-head-cell p-0 border-0 font-normal">click row to expand</span>
      </div>

      {attempts.length === 0 && (
        <div className="py-8 text-center sf-text-muted text-sm">
          {hasData ? 'No search attempts recorded yet.' : 'Loading attempts\u2026'}
        </div>
      )}

      {attempts.map((attempt) => {
        const key = `attempt:${attempt.attempt_no}`;
        const isExpanded = expandedRows[key] !== false;
        return (
          <AttemptCard
            key={attempt.attempt_no}
            attempt={attempt}
            expanded={isExpanded}
            onToggle={() => onToggleRow(key)}
            onJourney={onJourney}
            onResults={onResults}
            workerId={workerId}
            category={category}
          />
        );
      })}
    </div>
  );
}

// ── Attempt Card ─────────────────────────────────────────────────────────────

function AttemptCard({ attempt, expanded, onToggle, onJourney, onResults, workerId, category }: {
  attempt: SearchWorkerAttempt;
  expanded: boolean;
  onToggle: () => void;
  onJourney: () => void;
  onResults: () => void;
  workerId: string;
  category: string;
}) {
  const isRunning = attempt.status === 'running';
  const isZero = attempt.status === 'zero';
  const status = searchStatusLabel(attempt.status);
  const label = attemptLabel(attempt);
  const displayProvider = attempt.resolved_provider || attempt.provider;

  const stateClass = isRunning ? 'sf-table-row sf-table-row-accent border-l-[3px] border-l-[var(--sf-token-accent)] pl-[13px]'
    : isZero ? 'sf-table-row border-l-[3px] border-l-[var(--sf-token-state-warning-fg)] pl-[13px]'
    : 'sf-table-row pl-4';

  return (
    <>
      <div className={`flex items-center gap-2.5 py-2.5 pr-4 border-b sf-border-soft cursor-pointer ${stateClass}`} onClick={onToggle}>
        <span className={`font-mono text-xs font-bold w-7 text-right shrink-0 ${attempt.attempt_type === 'fallback' ? 'text-[var(--sf-token-state-warning-fg)]' : 'sf-text-dim'}`}>
          {label}
        </span>
        <span className={`text-xs font-medium flex-1 min-w-0 truncate ${isRunning ? 'text-[var(--sf-token-accent)]' : 'sf-text-primary'}`}>
          {isRunning && <span className="sf-blink mr-1" style={{ color: 'var(--sf-token-accent)' }}>{'\u258C'}</span>}
          {attempt.query || '\u2014'}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <ProviderPill provider={displayProvider} />
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${status.chipClass}`}>{status.label}</span>
          <span className={`font-mono text-[11px] font-semibold ${isRunning ? 'sf-text-dim' : isZero ? 'text-[var(--sf-token-state-warning-fg)]' : 'sf-text-muted'}`}>
            {isRunning ? '\u2014' : `${attempt.result_count} res`}
          </span>
          <span className={`font-mono text-[11px] ${isRunning ? 'text-[var(--sf-token-state-info-fg)] animate-pulse' : attempt.duration_ms > 2000 ? 'text-[var(--sf-token-state-warning-fg)] font-bold' : 'sf-text-dim'}`}>
            {isRunning ? formatMs(attempt.duration_ms || 0) : formatMs(attempt.duration_ms)}
          </span>
          <button className={`w-6 h-6 rounded flex items-center justify-center text-[10px] transition-all ${expanded ? 'sf-chip-active border border-current' : 'sf-icon-button border sf-border-soft'}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
        </div>
      </div>

      {expanded && (
        <AttemptDetail attempt={attempt} workerId={workerId} onJourney={onJourney} onResults={onResults} category={category} />
      )}
    </>
  );
}

// ── Attempt Detail (expanded) ────────────────────────────────────────────────

function AttemptDetail({ attempt, workerId, onJourney, onResults, category }: {
  attempt: SearchWorkerAttempt; workerId: string;
  onJourney: () => void; onResults: () => void; category: string;
}) {
  const [rawOpen, toggleRawOpen] = usePersistedToggle(`runtimeOps:searchDash:raw:${category}:${attempt.attempt_no}`, false);
  const formatTime = useFormatTime(true, true);
  const triage = useMemo(() => computeTriageSummary(attempt.results ?? []), [attempt.results]);
  const results = attempt.results ?? [];

  return (
    <div className="sf-table-expanded-row border-b sf-border-soft px-4 py-3">
      {/* Header: query + meta inline */}
      <div className="flex items-baseline gap-3 flex-wrap pb-2.5 mb-3 border-b sf-border-soft">
        <span className="font-mono text-[13px] font-semibold text-[var(--sf-token-accent-strong)] break-all flex-1 min-w-[200px]">
          {attempt.query}
        </span>
        <div className="flex gap-3.5 text-[10px] sf-text-dim shrink-0">
          <span>Provider: <strong className="sf-text-muted font-mono">{attempt.provider}</strong></span>
          <span>Type: <strong className="sf-text-muted font-mono">{attempt.attempt_type}</strong></span>
          <span>Duration: <strong className="sf-text-muted font-mono">{formatMs(attempt.duration_ms)}</strong></span>
          <span>Started: <strong className="sf-text-muted font-mono">{formatTime(attempt.started_ts)}</strong></span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button type="button" onClick={onJourney} className="px-1.5 py-0.5 rounded text-[10px] font-semibold sf-icon-button border sf-border-soft">JRN</button>
          <button type="button" onClick={onResults} className="px-1.5 py-0.5 rounded text-[10px] font-semibold sf-icon-button border sf-border-soft">RES</button>
        </div>
      </div>

      {/* Triage bar */}
      {triage.total > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-dim">Triage</span>
            <span className="text-[10px] sf-text-muted font-mono">{triage.total} results &rarr; {triage.fetched} fetched</span>
          </div>
          <div className="h-1.5 rounded overflow-hidden sf-surface-panel flex mb-1.5">
            {triage.keep > 0 && <div className="h-full" style={{ width: `${(triage.keep / triage.total) * 100}%`, background: 'var(--sf-token-state-success-fg)' }} />}
            {triage.maybe > 0 && <div className="h-full" style={{ width: `${(triage.maybe / triage.total) * 100}%`, background: 'var(--sf-token-state-warning-fg)' }} />}
            {triage.drop > 0 && <div className="h-full" style={{ width: `${(triage.drop / triage.total) * 100}%`, background: 'rgba(248,113,113,0.6)' }} />}
            {triage.hardDrop > 0 && <div className="h-full" style={{ width: `${(triage.hardDrop / triage.total) * 100}%`, background: 'var(--sf-token-state-error-fg)' }} />}
          </div>
          <div className="flex gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-sm" style={{ background: 'var(--sf-token-state-success-fg)' }} /> <strong style={{ color: 'var(--sf-token-state-success-fg)' }}>{triage.keep}</strong> <span className="sf-text-dim">keep</span></span>
            {triage.maybe > 0 && <span className="flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-sm" style={{ background: 'var(--sf-token-state-warning-fg)' }} /> <strong style={{ color: 'var(--sf-token-state-warning-fg)' }}>{triage.maybe}</strong> <span className="sf-text-dim">maybe</span></span>}
            <span className="flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-sm" style={{ background: 'rgba(248,113,113,0.6)' }} /> <strong style={{ color: 'var(--sf-token-state-error-fg)' }}>{triage.drop}</strong> <span className="sf-text-dim">drop</span></span>
            {triage.hardDrop > 0 && <span className="flex items-center gap-1"><span className="w-[7px] h-[7px] rounded-sm" style={{ background: 'var(--sf-token-state-error-fg)' }} /> <strong style={{ color: 'var(--sf-token-state-error-fg)' }}>{triage.hardDrop}</strong> <span className="sf-text-dim">hard drop</span></span>}
          </div>
        </div>
      )}

      {/* Result rows */}
      {results.length > 0 && (
        <div className="mb-3">
          {results.map((r, i) => {
            const dd = resolveDecisionDisplay(r, { isCrawled: Boolean(r.already_crawled) });
            const isDropped = r.decision === 'drop' || r.decision === 'hard_drop';
            return (
              <div key={r.url} className={`grid grid-cols-[28px_18px_60px_44px_1fr_80px] items-center gap-1.5 py-1.5 border-b sf-border-soft last:border-b-0 text-[11px] ${isDropped ? 'opacity-50' : ''}`}>
                <span className="font-mono font-bold sf-text-dim text-right">#{r.rank || i + 1}</span>
                <span className={`w-[7px] h-[7px] rounded-full justify-self-center ${r.fetched ? 'bg-[var(--sf-token-state-success-fg)]' : 'bg-[var(--sf-token-state-error-fg)] opacity-40'}`} />
                <span className={`text-[9px] font-extrabold uppercase text-center px-1.5 py-0.5 rounded ${dd.chipClass}`}>{dd.label}</span>
                <span className="font-mono font-bold sf-text-muted text-right">{r.score > 0 ? r.score.toFixed(1) : '\u2014'}</span>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="sf-link font-mono truncate min-w-0 text-[10px]" title={r.url}>
                  {r.url}
                </a>
                <span className="text-[9px] font-mono sf-text-dim text-right truncate">
                  {r.fetched && r.fetch_worker_id ? `${r.fetch_link_type === 'host_fallback' ? 'Host' : 'Exact'} \u2192 ${r.fetch_worker_id.slice(-6)}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Raw Request & Response — collapsible */}
      <div className="border-t sf-border-soft pt-2.5">
        <button onClick={toggleRawOpen} className="flex items-center gap-2 text-left w-full py-1 cursor-pointer">
          <span className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-dim">Raw Request &amp; Response</span>
          <span className={`text-[10px] sf-text-dim transition-transform inline-block ${rawOpen ? 'rotate-180' : ''}`}>{'\u25BC'}</span>
        </button>
        {rawOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <div>
              <div className="text-[9px] font-extrabold uppercase tracking-[0.08em] sf-text-dim mb-1.5">Request</div>
              <pre className="sf-pre-block text-[10px] font-mono rounded p-3 overflow-auto max-h-[200px] whitespace-pre-wrap leading-relaxed">
                {JSON.stringify({ q: attempt.query, provider: attempt.provider, type: attempt.attempt_type, num: attempt.result_count || 15 }, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-[9px] font-extrabold uppercase tracking-[0.08em] sf-text-dim mb-1.5">Debug Payload</div>
              <pre className="sf-pre-block text-[10px] font-mono rounded p-3 overflow-auto max-h-[200px] whitespace-pre-wrap leading-relaxed">
                {JSON.stringify({
                  attempt_no: attempt.attempt_no, query: attempt.query, provider: attempt.provider,
                  status: attempt.status, result_count: attempt.result_count, duration_ms: attempt.duration_ms,
                  started_ts: attempt.started_ts, finished_ts: attempt.finished_ts, worker_id: workerId,
                }, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
