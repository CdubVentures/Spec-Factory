import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { formatMs, getRefetchInterval, triageDecisionBadgeClass } from '../../helpers';
import { providerDisplayLabel } from '../../selectors/searchResultsHelpers.js';
import type { RuntimeOpsWorkerRow, WorkerDetailResponse, SearchWorkerAttempt, SearchResultEntry, PrefetchTabKey } from '../../types';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  google: { text: 'rgb(29 78 216)',  bg: 'rgb(59 130 246 / 0.06)',  border: 'rgb(59 130 246 / 0.21)' },
  bing:   { text: 'rgb(8 145 178)',  bg: 'rgb(6 182 212 / 0.06)',   border: 'rgb(6 182 212 / 0.21)' },
  brave:  { text: 'rgb(146 64 14)',  bg: 'rgb(245 158 11 / 0.06)',  border: 'rgb(245 158 11 / 0.21)' },
  serper: { text: 'rgb(15 118 110)', bg: 'rgb(20 184 166 / 0.06)',  border: 'rgb(20 184 166 / 0.21)' },
};

const PROVIDER_COLORS_DARK: Record<string, { text: string; bg: string; border: string }> = {
  google: { text: 'rgb(147 197 253)', bg: 'rgb(59 130 246 / 0.1)',   border: 'rgb(59 130 246 / 0.28)' },
  bing:   { text: 'rgb(103 232 249)', bg: 'rgb(6 182 212 / 0.1)',    border: 'rgb(6 182 212 / 0.28)' },
  brave:  { text: 'rgb(253 224 71)',  bg: 'rgb(245 158 11 / 0.1)',   border: 'rgb(245 158 11 / 0.28)' },
  serper: { text: 'rgb(94 234 212)',  bg: 'rgb(20 184 166 / 0.1)',   border: 'rgb(20 184 166 / 0.28)' },
};

function getProviderColors(provider: string): { text: string; bg: string; border: string } {
  const p = provider.toLowerCase();
  const isDark = document.documentElement.getAttribute('data-sf-theme-mode') === 'dark';
  const map = isDark ? PROVIDER_COLORS_DARK : PROVIDER_COLORS;
  for (const key of Object.keys(map)) {
    if (p.includes(key)) return map[key];
  }
  return isDark
    ? { text: 'rgb(156 163 175)', bg: 'rgb(156 163 175 / 0.08)', border: 'rgb(156 163 175 / 0.2)' }
    : { text: 'rgb(107 114 128)', bg: 'rgb(107 114 128 / 0.06)', border: 'rgb(107 114 128 / 0.18)' };
}

function searchStatusLabel(status: string): { label: string; chipClass: string } {
  switch (status) {
    case 'done':
      return { label: 'Done', chipClass: 'sf-chip-success' };
    case 'zero':
      return { label: '0 results', chipClass: 'sf-chip-warning' };
    case 'running':
      return { label: 'Running\u2026', chipClass: 'sf-chip-info' };
    default:
      return { label: status, chipClass: 'sf-chip-neutral' };
  }
}

function formatTime(ts: string | null): string {
  if (!ts) return '\u2014';
  const match = ts.match(/(\d{2}:\d{2}:\d{2})/);
  if (match) return match[1];
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '\u2014';
    return d.toTimeString().slice(0, 8);
  } catch {
    return '\u2014';
  }
}

function stateBadgeContent(state: string): { label: string; chipClass: string; pulse: boolean } {
  switch (state) {
    case 'running':
      return { label: 'Running', chipClass: 'sf-chip-success', pulse: true };
    case 'stuck':
      return { label: '\u26A0 Stalled', chipClass: 'sf-chip-warning', pulse: false };
    case 'idle':
      return { label: '\u25CB Idle', chipClass: 'sf-chip-neutral', pulse: false };
    default:
      return { label: state, chipClass: 'sf-chip-neutral', pulse: false };
  }
}

// ── Inline sub-components ────────────────────────────────────────────────────

function SlotIcon({ slot }: { slot: string }) {
  return (
    <div
      className="w-14 h-14 rounded-lg flex flex-col items-center justify-center shrink-0"
      style={{
        background: 'rgb(var(--sf-color-accent-rgb) / 0.07)',
        border: '1px solid rgb(var(--sf-color-accent-rgb) / 0.25)',
        boxShadow: '0 0 0 3px rgb(var(--sf-color-accent-rgb) / 0.07)',
      }}
    >
      <span className="text-[22px] font-bold leading-none" style={{ color: 'rgb(var(--sf-color-accent-rgb))' }}>
        {slot}
      </span>
      <span className="sf-text-nano font-medium" style={{ color: 'rgb(var(--sf-color-accent-strong-rgb))' }}>
        slot
      </span>
    </div>
  );
}

function ProviderPill({ provider }: { provider: string }) {
  const label = providerDisplayLabel(provider) || provider || '\u2014';
  const colors = getProviderColors(provider);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded sf-text-caption font-mono whitespace-nowrap"
      style={{ color: colors.text, background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      {label}
    </span>
  );
}

function StoryCard({ label, note, isActive, isDone, isStuck }: {
  label: string;
  note: string;
  isActive: boolean;
  isDone: boolean;
  isStuck: boolean;
}) {
  const active = isActive;
  const done = isDone && !isActive;
  const stuckActive = isActive && isStuck;

  const borderStyle = active
    ? (stuckActive
      ? '1px solid rgb(245 158 11 / 0.4)'
      : '1px solid rgb(var(--sf-color-accent-rgb) / 0.4)')
    : done
      ? '1px solid rgb(var(--sf-color-accent-rgb) / 0.2)'
      : undefined;

  const bgStyle = active
    ? (stuckActive
      ? 'rgb(245 158 11 / 0.04)'
      : 'rgb(var(--sf-color-accent-rgb) / 0.04)')
    : undefined;

  const shadowStyle = active
    ? (stuckActive
      ? '0 0 0 2px rgb(245 158 11 / 0.1)'
      : '0 0 0 2px rgb(var(--sf-color-accent-rgb) / 0.1)')
    : undefined;

  /* Step circle — done gets a colored fill, active gets spin glyph */
  const circleColor = (active || done)
    ? 'rgb(var(--sf-color-accent-rgb))'
    : undefined;

  const circleBorderColor = (active || done)
    ? 'rgb(var(--sf-color-accent-rgb))'
    : undefined;

  const circleBgColor = done
    ? 'rgb(var(--sf-color-accent-rgb) / 0.1)'
    : undefined;

  return (
    <div
      className={`flex-1 rounded-lg p-3 ${
        !active && !done ? 'sf-surface-card sf-border-soft border' : 'sf-surface-card'
      }`}
      style={{
        ...(borderStyle ? { border: borderStyle } : {}),
        ...(bgStyle ? { background: bgStyle } : {}),
        ...(shadowStyle ? { boxShadow: shadowStyle } : {}),
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center sf-text-nano font-bold shrink-0"
          style={{
            borderWidth: '1.5px',
            borderStyle: 'solid',
            borderColor: circleBorderColor ?? 'var(--sf-token-border-subtle)',
            color: circleColor ?? 'var(--sf-token-text-dim)',
            background: circleBgColor,
          }}
        >
          {active ? '\u21BB' : done ? '\u2713' : ''}
        </div>
        <span className={`text-xs ${active ? 'font-semibold sf-text-primary' : done ? 'font-medium sf-text-primary' : 'sf-text-muted'}`}>
          {label}
        </span>
      </div>
      <div className="sf-text-caption sf-text-muted font-mono pl-[26px]">{note}</div>
    </div>
  );
}

function KpiCard({ label, value, glow, valueClass }: {
  label: string;
  value: string;
  glow?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className={`flex-1 min-w-0 sf-surface-card rounded-lg px-4 py-3.5 ${glow ? 'sf-kpi-glow-accent' : ''}`}
      style={glow
        ? undefined
        : { border: '1px solid var(--sf-token-border-default)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
      }
    >
      <div className="sf-text-nano font-semibold tracking-wider uppercase sf-text-muted mb-1.5">{label}</div>
      <div className={`text-[22px] font-bold leading-none tabular-nums ${valueClass ?? 'sf-text-primary'}`}>
        {value}
      </div>
    </div>
  );
}

function AttemptRow({ attempt, isDebugOpen, isResultsOpen, onToggleDebug, onToggleResults, onJourney, onResults }: {
  attempt: SearchWorkerAttempt;
  isDebugOpen: boolean;
  isResultsOpen: boolean;
  onToggleDebug: () => void;
  onToggleResults: () => void;
  onJourney: () => void;
  onResults: () => void;
}) {
  const isAttemptRunning = attempt.status === 'running';
  const status = searchStatusLabel(attempt.status);
  const resultCount = attempt.result_count;
  const durationMs = attempt.duration_ms;
  const displayProvider = attempt.resolved_provider || attempt.provider;
  const hasResults = attempt.results && attempt.results.length > 0;

  return (
    <tr className={`border-t sf-border-soft sf-table-row ${
      isAttemptRunning ? 'sf-table-row-accent' : ''
    } ${isDebugOpen || isResultsOpen ? 'sf-table-row-highlight' : ''}`}>
      <td className="px-2.5 py-2.5 text-right font-mono sf-text-dim sf-text-caption">#{attempt.attempt_no}</td>
      <td className="px-2.5 py-2.5 min-w-0">
        <span
          className={`font-mono text-xs block truncate max-w-full ${isAttemptRunning ? '' : 'sf-text-primary'}`}
          style={isAttemptRunning ? { color: 'rgb(var(--sf-color-accent-rgb))' } : undefined}
        >
          {isAttemptRunning && (
            <span className="sf-blink mr-1" style={{ color: 'rgb(var(--sf-color-accent-rgb))' }}>{'\u258C'}</span>
          )}
          {attempt.query || '\u2014'}
        </span>
      </td>
      <td className="px-2 py-2.5">
        <ProviderPill provider={displayProvider} />
      </td>
      <td className="px-2 py-2.5">
        <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${status.chipClass}`}>
          {status.label}
        </span>
      </td>
      <td className="px-2.5 py-2.5 text-right font-mono font-medium">
        <span style={{
          color: attempt.status === 'running'
            ? 'var(--sf-token-text-dim)'
            : resultCount === 0
              ? 'rgb(146 64 14)'
              : undefined,
          fontWeight: resultCount != null && resultCount > 0 ? 500 : 400,
        }}>
          {attempt.status === 'running' ? '\u2014' : String(resultCount)}
        </span>
      </td>
      <td className="px-2.5 py-2.5 text-right font-mono sf-text-caption">
        <span style={{
          color: attempt.status === 'running'
            ? 'var(--sf-token-text-dim)'
            : durationMs > 2000
              ? 'rgb(146 64 14)'
              : 'var(--sf-token-text-muted)',
          fontWeight: durationMs > 2000 ? 600 : 400,
        }}>
          {attempt.status === 'running' ? '\u2014' : formatMs(durationMs)}
        </span>
      </td>
      <td className="px-2.5 py-2.5 text-right font-mono sf-text-dim sf-text-caption">
        {formatTime(attempt.started_ts)}
      </td>
      <td className="px-2 py-2">
        {!isAttemptRunning ? (
          <div className="flex items-center gap-1 justify-end">
            {hasResults && (
              <button
                type="button"
                onClick={onToggleResults}
                className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${
                  isResultsOpen ? 'sf-chip-active' : 'sf-icon-button border sf-border-soft'
                }`}
                title="Toggle search results"
              >
                URLs
              </button>
            )}
            <button
              type="button"
              onClick={onJourney}
              className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-icon-button border sf-border-soft"
              title="Query Journey"
            >
              JRN
            </button>
            <button
              type="button"
              onClick={onResults}
              className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-icon-button border sf-border-soft"
              title="Search Results"
            >
              RES
            </button>
            <button
              type="button"
              onClick={onToggleDebug}
              className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${
                isDebugOpen ? 'sf-chip-active' : 'sf-icon-button border sf-border-soft'
              }`}
              title="Toggle debug payload"
            >
              {'\u00B7\u00B7\u00B7'}
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function triageRowBg(decision: string): React.CSSProperties | undefined {
  switch (decision) {
    case 'drop':
    case 'skip':
      return { background: 'rgb(239 68 68 / 0.06)', borderLeft: '2px solid rgb(239 68 68 / 0.3)' };
    case 'maybe':
      return { background: 'rgb(245 158 11 / 0.06)', borderLeft: '2px solid rgb(245 158 11 / 0.3)' };
    default:
      return undefined;
  }
}

function fetchStatusBadge(r: SearchResultEntry): React.ReactNode {
  if (r.fetched && r.fetch_worker_id) {
    const shortId = r.fetch_worker_id.length > 12
      ? r.fetch_worker_id.slice(-6)
      : r.fetch_worker_id;
    const displayWorkerId = shortId.startsWith('fetch-') ? shortId : `fetch-${shortId}`;
    const linkageLabel = r.fetch_link_type === 'host_fallback'
      ? 'Host fallback'
      : 'Exact';
    return (
      <span
        className="sf-text-nano font-mono px-1.5 py-0.5 rounded sf-chip-success shrink-0"
        title={`${linkageLabel === 'Exact' ? 'Exact URL match' : 'Same-host fallback'} via ${r.fetch_worker_id}`}
      >
        {`${linkageLabel} ${displayWorkerId}`}
      </span>
    );
  }
  if (!r.fetched && r.decision === 'keep') {
    return <span className="sf-text-nano px-1.5 py-0.5 rounded sf-chip-neutral shrink-0">Queued</span>;
  }
  if (!r.fetched && r.decision === 'drop') {
    return null;
  }
  if (!r.fetched && r.decision === 'unknown') {
    return <span className="sf-text-nano px-1.5 py-0.5 rounded sf-chip-neutral shrink-0 opacity-50">No triage data</span>;
  }
  return null;
}

function formatScoreComponent(value: number): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : '0.0';
}

function ScoreEvidence({ rationale, scoreComponents }: {
  rationale: string;
  scoreComponents: SearchResultEntry['score_components'];
}) {
  if (!rationale && !scoreComponents) {
    return null;
  }
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {rationale ? (
        <div className="sf-text-nano sf-text-muted truncate" title={rationale}>
          {rationale}
        </div>
      ) : null}
      {scoreComponents ? (
        <div
          className="sf-text-nano font-mono sf-text-dim truncate"
          title={`base ${formatScoreComponent(scoreComponents.base_relevance)} · tier ${formatScoreComponent(scoreComponents.tier_boost)} · id ${formatScoreComponent(scoreComponents.identity_match)} · pen ${formatScoreComponent(scoreComponents.penalties)}`}
        >
          {`base ${formatScoreComponent(scoreComponents.base_relevance)} · tier ${formatScoreComponent(scoreComponents.tier_boost)} · id ${formatScoreComponent(scoreComponents.identity_match)} · pen ${formatScoreComponent(scoreComponents.penalties)}`}
        </div>
      ) : null}
    </div>
  );
}

function ResultsDrawer({ results }: { results: SearchResultEntry[] }) {
  const fetchedCount = results.filter((r) => r.fetched).length;
  const keptCount = results.filter((r) => r.decision === 'keep').length;
  const droppedCount = results.filter((r) => r.decision === 'drop').length;
  const maybeCount = results.filter((r) => r.decision === 'maybe').length;
  return (
    <tr className="border-t sf-border-soft">
      <td colSpan={8} className="px-0 py-0">
        <div className="px-5 py-2.5" style={{ background: 'rgb(var(--sf-color-accent-rgb) / 0.02)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="sf-text-caption font-semibold sf-text-primary">
              Search Results
            </span>
            <span className="sf-text-nano sf-text-muted">
              {results.length} URLs &middot; {fetchedCount} fetched &middot; {keptCount} kept, {droppedCount} dropped, {maybeCount} maybe
            </span>
          </div>
          <div className="flex flex-col gap-px overflow-hidden border sf-border-soft">
            {results.map((r, i) => (
              <div
                key={r.url}
                className="flex items-center gap-2.5 px-3 py-1.5 sf-surface-card"
                style={triageRowBg(r.decision)}
              >
                <span className="sf-text-nano font-mono sf-text-dim w-5 text-right shrink-0">
                  {r.rank || i + 1}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.fetched ? 'bg-green-500' : 'sf-bg-muted'}`}
                  title={r.fetched ? `Fetched by ${r.fetch_worker_id}` : 'Not fetched'}
                />
                <span className={`px-1.5 py-0.5 rounded-full sf-text-nano font-medium shrink-0 ${triageDecisionBadgeClass(r.decision)}`}>
                  {r.decision}
                </span>
                {r.score > 0 && (
                  <span className="sf-text-nano font-mono sf-text-dim shrink-0" title={r.rationale || undefined}>
                    {r.score.toFixed(1)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono sf-text-caption truncate sf-link"
                      title={r.url}
                    >
                      {r.domain}
                    </a>
                    {fetchStatusBadge(r)}
                  </div>
                  <div className="sf-text-nano sf-text-muted truncate" title={r.url}>
                    {r.title || r.url}
                  </div>
                  <ScoreEvidence rationale={r.rationale} scoreComponents={r.score_components} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );
}

function AttemptResultsPreview({ results }: { results: SearchResultEntry[] }) {
  const keptCount = results.filter((r) => r.decision === 'keep').length;
  const droppedCount = results.filter((r) => r.decision === 'drop').length;
  const maybeCount = results.filter((r) => r.decision === 'maybe').length;

  return (
    <tr className="border-t sf-border-soft">
      <td colSpan={8} className="px-0 py-0">
        <div className="px-5 py-2.5 sf-surface-card">
          <div className="flex flex-wrap items-center gap-2">
            <span className="sf-text-caption font-semibold sf-text-primary">Query results</span>
            <span className="sf-text-nano sf-text-muted">
              {results.length} results &mdash; {keptCount} kept, {droppedCount} dropped, {maybeCount} maybe
            </span>
          </div>
          <div className="mt-2 overflow-x-auto">
            <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
              {results.map((result, index) => {
                const rank = result.rank || index + 1;
                const domain = result.domain || result.url;
                return (
                  <div
                    key={`${result.url}:${rank}`}
                    className="w-[14rem] shrink-0 border sf-border-soft px-3 py-2"
                    style={triageRowBg(result.decision)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="sf-text-nano font-mono sf-text-dim shrink-0">{`#${rank}`}</span>
                      <span className={`px-1 py-0 rounded-full sf-text-nano font-medium ${triageDecisionBadgeClass(result.decision)}`}>
                        {result.decision}
                      </span>
                      {result.score > 0 && (
                        <span className="sf-text-nano font-mono sf-text-dim">{result.score.toFixed(1)}</span>
                      )}
                    </div>
                    <div className="mt-1">
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono sf-text-caption sf-link block"
                        title={result.url}
                      >
                        {domain}
                      </a>
                    </div>
                    <div className="mt-1 truncate sf-text-nano sf-text-muted" title={result.title || result.url}>
                      {result.title || result.url}
                    </div>
                    <ScoreEvidence rationale={result.rationale} scoreComponents={result.score_components} />
                    <div className="mt-1.5">
                      {fetchStatusBadge(result)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function AttemptRowWithDrawer({ attempt, isDebugOpen, isResultsOpen, onToggleDebug, onToggleResults, onJourney, onResults, workerId }: {
  attempt: SearchWorkerAttempt;
  isDebugOpen: boolean;
  isResultsOpen: boolean;
  onToggleDebug: () => void;
  onToggleResults: () => void;
  onJourney: () => void;
  onResults: () => void;
  workerId: string;
}) {
  return (
    <>
      <AttemptRow
        attempt={attempt}
        isDebugOpen={isDebugOpen}
        isResultsOpen={isResultsOpen}
        onToggleDebug={onToggleDebug}
        onToggleResults={onToggleResults}
        onJourney={onJourney}
        onResults={onResults}
      />
      {!isResultsOpen && attempt.results && attempt.results.length > 0 && (
        <AttemptResultsPreview results={attempt.results} />
      )}
      {isResultsOpen && attempt.results && attempt.results.length > 0 && (
        <ResultsDrawer results={attempt.results} />
      )}
      {isDebugOpen && <DebugDrawer attempt={attempt} workerId={workerId} />}
    </>
  );
}

function DebugDrawer({ attempt, workerId }: { attempt: SearchWorkerAttempt; workerId: string }) {
  const payload = {
    attempt_no: attempt.attempt_no,
    query: attempt.query,
    provider: attempt.provider,
    status: attempt.status,
    result_count: attempt.result_count,
    duration_ms: attempt.duration_ms,
    started_ts: attempt.started_ts,
    finished_ts: attempt.finished_ts,
    worker_id: workerId,
    slot_reuse: true,
  };

  return (
    <tr className="border-t sf-border-soft">
      <td colSpan={8} className="sf-debug-drawer">
        <div className="sf-debug-drawer-label">
          Debug payload &mdash; attempt #{attempt.attempt_no}
        </div>
        <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </td>
    </tr>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SearchWorkerPanel({
  runId,
  worker,
  isRunning,
  category: _category,
  onOpenQueryJourney,
  onOpenSearchResults,
  onOpenPrefetchTab: _onOpenPrefetchTab,
}: SearchWorkerPanelProps) {
  const [debugRows, setDebugRows] = useState<Set<number>>(new Set());
  const [resultsRows, setResultsRows] = useState<Set<number>>(new Set());

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
  const providerLabel = providerDisplayLabel(activeProvider) || activeProvider || '\u2014';
  const slotLabel = String(worker.slot ?? '\u2014').trim() || '\u2014';
  const tasksStarted = worker.tasks_started ?? 0;
  const tasksCompleted = worker.tasks_completed ?? attempts.length;
  const zeroResultCount = worker.zero_result_count ?? attempts.filter((a) => a.status === 'zero').length;
  const avgResults = worker.avg_result_count ?? 0;
  const avgDurationMs = worker.avg_duration_ms ?? 0;

  const isWorkerRunning = worker.state === 'running';
  const isWorkerStuck = worker.state === 'stuck';
  const badge = stateBadgeContent(worker.state);

  const toggleDebug = (attemptNo: number) => {
    setDebugRows((prev) => {
      const next = new Set(prev);
      if (next.has(attemptNo)) next.delete(attemptNo); else next.add(attemptNo);
      return next;
    });
  };

  const toggleResults = (attemptNo: number) => {
    setResultsRows((prev) => {
      const next = new Set(prev);
      if (next.has(attemptNo)) next.delete(attemptNo); else next.add(attemptNo);
      return next;
    });
  };

  // Story strip step states
  const stepsData = [
    {
      label: 'Assigned',
      note: `slot ${slotLabel} \u00B7 ${tasksStarted} tasks`,
      isActive: false,
      isDone: tasksStarted > 0,
    },
    {
      label: 'Executing',
      note: isWorkerRunning || isWorkerStuck ? providerLabel : 'no active provider',
      isActive: isWorkerRunning || isWorkerStuck,
      isDone: worker.state === 'idle',
    },
    {
      label: 'Results',
      note: `${tasksCompleted} done \u00B7 avg ${avgResults.toFixed(1)} res/q`,
      isActive: false,
      isDone: tasksCompleted > 0,
    },
  ];

  /* KPI value colors — match mockup's per-card coloring */
  const completedValueClass = tasksCompleted > 0 ? 'text-green-600 dark:text-green-400' : 'sf-text-muted';
  const zeroValueClass = zeroResultCount > 0 ? 'sf-text-amber' : 'sf-text-muted';
  const latencyValueClass = avgDurationMs > 2000 ? 'sf-text-amber' : 'sf-text-primary';

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* ── Top section (pinned, no scroll) ── */}
      <div className="shrink-0 px-5 pt-4 pb-0 flex flex-col gap-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold sf-text-primary">Search Worker</h3>
          <span className="px-2 py-0.5 rounded sf-text-caption font-medium sf-chip-neutral">
            Slot {slotLabel}
          </span>
          <span className="px-2 py-0.5 rounded sf-text-caption font-medium sf-chip-info">
            Provider: {providerLabel}
          </span>
        </div>

        {/* ── Slot identity row ── */}
        <RuntimeIdxBadgeStrip badges={worker.idx_runtime} />

        <div className="flex items-center gap-3.5 flex-wrap">
          <SlotIcon slot={slotLabel} />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2.5">
              <span className="text-lg font-bold sf-text-primary">{worker.worker_id}</span>
              <span
                className="text-[13px] font-semibold font-mono px-2 py-0.5 rounded"
                style={{
                  color: 'rgb(var(--sf-color-accent-strong-rgb))',
                  background: 'rgb(var(--sf-color-accent-rgb) / 0.07)',
                  border: '1px solid rgb(var(--sf-color-accent-rgb) / 0.22)',
                }}
              >
                [{tasksStarted}]
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full sf-text-caption font-medium ${badge.chipClass}`}>
                {badge.pulse && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block shrink-0" />
                )}
                {badge.label}
              </span>
              {activeProvider && <ProviderPill provider={activeProvider} />}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenQueryJourney}
              className="px-3 py-1.5 rounded sf-text-caption font-medium sf-icon-button"
            >
              Open Query Journey
            </button>
            <button
              type="button"
              onClick={onOpenSearchResults}
              className="px-3 py-1.5 rounded sf-text-caption font-medium sf-primary-button"
            >
              Open Search Results
            </button>
          </div>
        </div>

        {/* ── Current query banner ── */}
        <div
          className="rounded-lg px-3.5 py-2.5"
          style={{
            background: isWorkerStuck
              ? 'rgb(255 251 235)'
              : activeQuery
                ? 'rgb(var(--sf-color-accent-rgb) / 0.07)'
                : undefined,
            border: isWorkerStuck
              ? '1px solid rgb(253 230 138)'
              : activeQuery
                ? '1px solid rgb(var(--sf-color-accent-rgb) / 0.20)'
                : '1px solid var(--sf-token-border-default)',
          }}
        >
          <div className="sf-text-nano font-semibold sf-text-muted mb-1">Current Query</div>
          <div className="flex items-center gap-1.5 font-mono text-[13px]">
            {isWorkerRunning && activeQuery && (
              <span className="sf-blink shrink-0" style={{ color: 'rgb(var(--sf-color-accent-rgb))' }}>{'\u258C'}</span>
            )}
            <span
              className="break-all"
              style={{
                color: isWorkerStuck
                  ? 'rgb(146 64 14)'
                  : activeQuery
                    ? 'rgb(var(--sf-color-accent-rgb))'
                    : undefined,
              }}
            >
              {activeQuery || 'No active query'}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs sf-text-muted">
            <span>
              Last result count: <span className="font-mono font-medium sf-text-primary">{worker.last_result_count ?? 0}</span>
            </span>
            <span>
              Last duration: <span className="font-mono font-medium sf-text-primary">{formatMs(worker.last_duration_ms ?? 0)}</span>
            </span>
            {(isWorkerRunning || isWorkerStuck) && worker.elapsed_ms > 0 && (
              <span>
                Elapsed: <span className={`font-mono font-medium ${worker.elapsed_ms > 10000 ? 'sf-text-amber' : 'sf-text-primary'}`}>
                  {formatMs(worker.elapsed_ms)}
                </span>
              </span>
            )}
          </div>
          {isWorkerStuck && (
            <div className="mt-1.5 text-xs font-medium" style={{ color: 'rgb(146 64 14)' }}>
              {'\u26A0'} No response from {providerLabel} &mdash; worker may be stalled
            </div>
          )}
          {worker.last_error && (
            <div className="mt-1.5 text-xs font-medium sf-chip-danger px-2 py-1 rounded inline-block">
              {'\u2717'} {worker.last_error}
            </div>
          )}
        </div>

        {/* ── Story strip ── */}
        <div className="flex items-center gap-2">
          {stepsData.map((step, i) => (
            <div key={step.label} className="contents">
              <StoryCard
                label={step.label}
                note={step.note}
                isActive={step.isActive}
                isDone={step.isDone}
                isStuck={isWorkerStuck}
              />
              {i < stepsData.length - 1 && (
                <span className="sf-text-dim text-base shrink-0 font-light">{'\u2192'}</span>
              )}
            </div>
          ))}
        </div>

        {/* ── KPI cards ── */}
        <div className="flex gap-2.5 flex-wrap pb-4">
          <KpiCard
            label="Started"
            value={String(tasksStarted)}
            glow={isWorkerRunning}
            valueClass="sf-text-accent"
          />
          <KpiCard label="Completed" value={String(tasksCompleted)} valueClass={completedValueClass} />
          <KpiCard label="Zero Results" value={String(zeroResultCount)} valueClass={zeroValueClass} />
          <KpiCard label="Avg Latency" value={formatMs(avgDurationMs)} valueClass={latencyValueClass} />
          <KpiCard label="Avg Res / Q" value={avgResults.toFixed(1)} valueClass="text-teal-600 dark:text-teal-400" />
        </div>
      </div>

      {/* ── Attempts table (fills remaining space, own scroll) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto border-t sf-border-default">
        <div style={{ minWidth: 680 }}>
          {/* Sticky header legend */}
          <div className="flex items-center justify-between gap-3 px-5 py-2 sf-surface-shell sticky top-0 z-10 border-b sf-border-soft">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold sf-text-primary">Attempts</span>
              <span className="sf-text-caption sf-text-subtle">
                Every search attempt routed through this slot.
              </span>
            </div>
            <span className="sf-text-nano sf-text-dim">
              JRN = query journey &middot; RES = search results &middot; {'\u00B7\u00B7\u00B7'} = debug
            </span>
          </div>

          <table className="w-full text-xs">
            <thead className="sticky top-[37px] z-[9]">
              <tr className="sf-table-head">
                <th className="sf-table-head-cell text-right px-2.5 py-2" style={{ width: 40 }}>#</th>
                <th className="sf-table-head-cell text-left px-2.5 py-2">Query</th>
                <th className="sf-table-head-cell text-left px-2 py-2" style={{ width: 86 }}>Provider</th>
                <th className="sf-table-head-cell text-left px-2 py-2" style={{ width: 100 }}>Status</th>
                <th className="sf-table-head-cell text-right px-2.5 py-2" style={{ width: 56 }}>Res</th>
                <th className="sf-table-head-cell text-right px-2.5 py-2" style={{ width: 72 }}>Dur</th>
                <th className="sf-table-head-cell text-right px-2.5 py-2" style={{ width: 62 }}>Time</th>
                <th className="sf-table-head-cell text-right px-2 py-2" style={{ width: 106 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {attempts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center sf-text-muted text-xs">
                    {data ? 'No search attempts recorded yet.' : 'Loading attempts\u2026'}
                  </td>
                </tr>
              ) : (
                attempts.map((attempt) => {
                  const isDbgOpen = debugRows.has(attempt.attempt_no);
                  const isResOpen = resultsRows.has(attempt.attempt_no);
                  return (
                    <AttemptRowWithDrawer
                      key={attempt.attempt_no}
                      attempt={attempt}
                      isDebugOpen={isDbgOpen}
                      isResultsOpen={isResOpen}
                      onToggleDebug={() => toggleDebug(attempt.attempt_no)}
                      onToggleResults={() => toggleResults(attempt.attempt_no)}
                      onJourney={onOpenQueryJourney}
                      onResults={onOpenSearchResults}
                      workerId={worker.worker_id}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
