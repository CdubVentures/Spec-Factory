import { useMemo, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import { getRefetchInterval } from '../../helpers.ts';
import { usePersistedTab, usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import type { LlmWorkerResponse, LlmCallRow, PrefetchTabKey, RuntimeIdxBadge } from '../../types.ts';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { shortModel, modelChipClass, accessBadgeClass, accessBadgeLabel } from '../../selectors/llmModelHelpers.ts';

// ── Call type metadata ───────────────────────────────────────────────────────

interface CallTypeDef {
  symbol: string;
  label: string;
  prefetchTab: PrefetchTabKey | null;
  tabCode: string | null;
  chipClass: string;
  barClass: string;
}

const CALL_TYPE_META: Record<string, CallTypeDef> = {
  needset_planner:   { symbol: '\u25A3', label: 'NeedSet Planner',  prefetchTab: 'needset',           tabCode: '01', chipClass: 'sf-chip-warning',     barClass: 'sf-bar-ct-needset-planner' },
  brand_resolver:    { symbol: '\u25C8', label: 'Brand Resolver',   prefetchTab: 'brand_resolver',    tabCode: '02', chipClass: 'sf-chip-info',        barClass: 'sf-bar-ct-brand-resolver' },
  search_planner:    { symbol: '\u25CE', label: 'Search Planner',   prefetchTab: 'search_planner',    tabCode: '04', chipClass: 'sf-chip-purple',      barClass: 'sf-bar-ct-search-planner' },
  serp_selector:     { symbol: '\u229E', label: 'SERP Selector',     prefetchTab: 'serp_selector',     tabCode: '07', chipClass: 'sf-chip-warning',     barClass: 'sf-bar-ct-serp-selector' },
  extraction:        { symbol: '\u25C9', label: 'Extraction',       prefetchTab: null, tabCode: null,  chipClass: 'sf-chip-accent',      barClass: 'sf-bar-ct-extraction' },
  validation:        { symbol: '\u2713', label: 'Candidate Valid.',  prefetchTab: null, tabCode: null,  chipClass: 'sf-chip-success',     barClass: 'sf-bar-ct-candidate-valid' },
  verification:      { symbol: '\u2713', label: 'Candidate Valid.',  prefetchTab: null, tabCode: null,  chipClass: 'sf-chip-success',     barClass: 'sf-bar-ct-candidate-valid' },
  field_judge:       { symbol: '\u2696', label: 'Field Judge',       prefetchTab: null, tabCode: null,  chipClass: 'sf-chip-danger',      barClass: 'sf-bar-ct-field-judge' },
  summary_writer:       { symbol: '\u270E', label: 'Summary Writer',   prefetchTab: null, tabCode: null,  chipClass: 'sf-chip-purple',      barClass: 'sf-bar-ct-summary-writer' },
  escalation_planner:   { symbol: '\u21D1', label: 'Escalation',       prefetchTab: null, tabCode: null,  chipClass: 'sf-chip-warning',     barClass: 'sf-bar-ct-serp-selector' },
  unknown:              { symbol: '?',      label: 'Unknown',          prefetchTab: null, tabCode: null,  chipClass: 'sf-chip-neutral',     barClass: 'sf-bar-ct-extraction' },
};

const CALL_TYPE_ORDER = [
  'needset_planner', 'brand_resolver', 'search_planner', 'serp_selector',
  'extraction', 'validation',
  'field_judge', 'summary_writer', 'escalation_planner',
];

function ctMeta(ct: string): CallTypeDef {
  return CALL_TYPE_META[ct] ?? CALL_TYPE_META['unknown'];
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString();
}

function fmtCost(usd: number, active = false): string {
  if (active) return '\u2014';
  if (!Number.isFinite(usd) || usd === 0) return '$0';
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtDur(ms: number | null, active = false): string {
  if (active) return '\u2014';
  if (ms == null || !Number.isFinite(ms) || ms === 0) return '\u2014';
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function pctOf(v: number, t: number): number {
  return t <= 0 ? 0 : Math.round((v / t) * 100);
}

// ── Input/Output preview formatters ──────────────────────────────────────────

function formatInputPreview(call: LlmCallRow): string {
  if (!call.prompt_preview) return '\u2014';
  try {
    const p = JSON.parse(call.prompt_preview);
    if (p.user) return String(p.user).slice(0, 120);
    if (p.redacted) return `${call.call_type} (${(p.system_chars || 0) + (p.user_chars || 0)} chars)`;
  } catch { /* use raw */ }
  return call.prompt_preview.slice(0, 120);
}

function formatOutputPreview(call: LlmCallRow): string {
  if (!call.response_preview) return '\u2014';
  return call.response_preview.slice(0, 120);
}

// ── Component ────────────────────────────────────────────────────────────────

interface LlmWorkerPanelProps {
  runId: string;
  category: string;
  isRunning: boolean;
  highlightWorkerId: string | null;
  idxRuntime?: RuntimeIdxBadge[];
  onOpenPrefetchTab: (tab: PrefetchTabKey) => void;
}

export function LlmWorkerPanel({
  runId,
  category,
  isRunning,
  highlightWorkerId,
  idxRuntime,
  onOpenPrefetchTab,
}: LlmWorkerPanelProps) {
  const [activeFilter, setActiveFilter] = usePersistedTab<string>(`runtimeOps:llmDash:filter:${category}`, 'all');
  const [expandedRows, toggleExpandedRow, replaceExpandedRows] = usePersistedExpandMap(`runtimeOps:llmDash:expandedRows:${category}`);
  const [summaryOpen, toggleSummaryOpen] = usePersistedToggle(`runtimeOps:llmDash:summary:${category}`, true);

  const { data: dashboard } = useQuery({
    queryKey: ['runtime-ops', runId, 'llm-dashboard'],
    queryFn: () => api.get<LlmWorkerResponse>(`/indexlab/run/${runId}/runtime/llm-dashboard`),
    enabled: Boolean(runId),
    refetchInterval: getRefetchInterval(isRunning, false, 3000, 15000),
  });

  const calls = dashboard?.calls ?? [];
  const summary = dashboard?.summary ?? null;

  // When user clicks a different LLM worker tab, auto-expand that row.
  useEffect(() => {
    if (!highlightWorkerId) return;
    if (!expandedRows[highlightWorkerId]) {
      replaceExpandedRows({ ...expandedRows, [highlightWorkerId]: true });
    }
  }, [highlightWorkerId]);

  const filteredCalls = useMemo(() => {
    if (activeFilter === 'all') return calls;
    return calls.filter((c) => c.call_type === activeFilter);
  }, [calls, activeFilter]);
  const highlightedCall = useMemo(
    () => calls.find((call) => call.worker_id === highlightWorkerId) ?? null,
    [calls, highlightWorkerId],
  );

  const stats = useMemo(() => {
    if (activeFilter === 'all' && summary) return summary;
    const fc = filteredCalls;
    let totalCost = 0, pTok = 0, cTok = 0, durSum = 0, durN = 0;
    const roundSet = new Set<number>();
    const modelMap: Record<string, { model: string; calls: number; cost_usd: number }> = {};
    const ctMap: Record<string, { call_type: string; cost_usd: number }> = {};
    let activeN = 0, doneN = 0;
    for (const c of fc) {
      totalCost += c.estimated_cost; pTok += c.prompt_tokens; cTok += c.completion_tokens;
      if (c.status === 'active') activeN++; else doneN++;
      if (c.status !== 'active' && c.duration_ms && c.duration_ms > 0) { durSum += c.duration_ms; durN++; }
      roundSet.add(c.round);
      const mk = c.model || 'unknown';
      if (!modelMap[mk]) modelMap[mk] = { model: mk, calls: 0, cost_usd: 0 };
      modelMap[mk].calls++; modelMap[mk].cost_usd += c.estimated_cost;
      const ck = c.call_type || 'unknown';
      if (!ctMap[ck]) ctMap[ck] = { call_type: ck, cost_usd: 0 };
      ctMap[ck].cost_usd += c.estimated_cost;
    }
    const maxRound = roundSet.size > 0 ? Math.max(...roundSet) : 0;
    return {
      total_calls: fc.length, active_calls: activeN, completed_calls: doneN,
      total_cost_usd: totalCost, total_tokens: pTok + cTok, prompt_tokens: pTok, completion_tokens: cTok,
      avg_latency_ms: durN > 0 ? Math.round(durSum / durN) : 0, rounds: roundSet.size,
      calls_in_latest_round: maxRound > 0 ? fc.filter((c) => c.round === maxRound).length : 0,
      by_model: Object.values(modelMap).sort((a, b) => b.cost_usd - a.cost_usd),
      by_call_type: Object.values(ctMap).sort((a, b) => b.cost_usd - a.cost_usd),
    };
  }, [filteredCalls, activeFilter, summary]);

  const roundGroups = useMemo(() => {
    const map = new Map<number, LlmCallRow[]>();
    for (const c of filteredCalls) {
      if (!map.has(c.round)) map.set(c.round, []);
      map.get(c.round)!.push(c);
    }
    const ctIdx = new Map(CALL_TYPE_ORDER.map((ct, i) => [ct, i]));
    const ctRank = (ct: string) => ctIdx.get(ct) ?? CALL_TYPE_ORDER.length;
    return [...map.entries()]
      .map(([round, rc]) => ({ round, calls: rc.sort((a, b) => ctRank(a.call_type) - ctRank(b.call_type)) }))
      .sort((a, b) => a.round - b.round);
  }, [filteredCalls]);

  const toggleRow = (workerId: string) => {
    toggleExpandedRow(workerId);
  };

  const handleTabClick = (tab: PrefetchTabKey, e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenPrefetchTab(tab);
  };

  const promptPct = pctOf(stats.prompt_tokens, stats.total_tokens);
  const completionPct = 100 - promptPct;

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1 min-h-0">

      {/* ── Title row (matches SearchWorkerPanel pattern) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold sf-text-primary">LLM Worker</h3>
        {highlightedCall && (
          <>
            <span className="px-2 py-0.5 rounded sf-text-caption font-medium sf-chip-neutral">
              {highlightedCall.worker_id}
            </span>
            <span className="px-2 py-0.5 rounded sf-text-caption font-medium sf-chip-info">
              Call Type: {highlightedCall.call_type}
            </span>
            <span className={`px-1 py-0.5 rounded sf-text-nano font-bold uppercase tracking-wider ${accessBadgeClass(Boolean(highlightedCall.is_lab))}`}>
              {accessBadgeLabel(Boolean(highlightedCall.is_lab))}
            </span>
            <span className={`px-2 py-0.5 rounded sf-text-caption font-medium ${modelChipClass(highlightedCall.model)}`}>
              Model: {highlightedCall.model || '\u2014'}
            </span>
          </>
        )}
        <span className="px-2 py-0.5 rounded sf-text-caption font-medium sf-chip-warning">
          {calls.length} total
        </span>
        {stats.active_calls > 0 && (
          <span className="px-2 py-0.5 rounded sf-text-caption font-semibold sf-chip-purple animate-pulse">
            {stats.active_calls} streaming
          </span>
        )}
        <span className="px-2 py-0.5 rounded sf-text-caption font-medium sf-chip-neutral">
          {stats.rounds} {stats.rounds === 1 ? 'round' : 'rounds'}
        </span>
      </div>

      <RuntimeIdxBadgeStrip badges={idxRuntime} />

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="sf-text-caption sf-text-muted font-medium">Filter:</span>
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-2.5 py-1 rounded sf-text-caption font-medium transition-colors ${
            activeFilter === 'all' ? 'sf-chip-active font-semibold' : 'sf-chip-default'
          }`}
        >
          All ({calls.length})
        </button>
        {CALL_TYPE_ORDER.map((ct) => {
          const meta = ctMeta(ct);
          const isOn = activeFilter === ct;
          return (
            <button
              key={ct}
              onClick={() => setActiveFilter(ct)}
              className={`px-2.5 py-1 rounded sf-text-caption font-medium transition-colors ${
                isOn ? `${meta.chipClass} font-semibold` : 'sf-chip-default'
              }`}
            >
              {meta.symbol} {meta.label}
            </button>
          );
        })}
      </div>

      {/* ── Collapsible Summary ── */}
      <div className="sf-surface-card p-4">
        {/* Toggle header */}
        <button
          onClick={toggleSummaryOpen}
          className="flex items-center gap-3 w-full text-left"
        >
          <span className="sf-text-nano font-bold tracking-wider uppercase sf-text-subtle">Summary</span>
          {activeFilter !== 'all' ? (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded sf-text-caption font-semibold ${ctMeta(activeFilter).chipClass}`}>
              {ctMeta(activeFilter).symbol} {ctMeta(activeFilter).label}
            </span>
          ) : (
            <span className="sf-text-caption sf-text-dim">all call types</span>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <span className="sf-text-caption font-semibold sf-text-primary tabular-nums">{stats.total_calls} calls</span>
            <span className="sf-text-caption font-semibold sf-text-primary tabular-nums">{fmtCost(stats.total_cost_usd)}</span>
            <span className="sf-text-caption font-semibold sf-text-primary tabular-nums">{fmtNum(stats.total_tokens)} tok</span>
            <span className="sf-text-caption font-semibold sf-text-primary tabular-nums">
              {stats.avg_latency_ms > 0 ? fmtLatency(stats.avg_latency_ms) : '\u2014'} avg
            </span>
            <span className={`sf-text-caption sf-text-muted transition-transform inline-block ${summaryOpen ? 'rotate-180' : ''}`}>
              {'\u25BC'}
            </span>
          </div>
        </button>

        {summaryOpen && (
          <div className="mt-3 space-y-3">
            {/* 5 stat cards */}
            <div className="flex gap-2.5 flex-wrap">
              <MiniStat label="Calls" value={String(stats.total_calls)}
                sub={`${stats.completed_calls} done${stats.active_calls > 0 ? ` \u00B7 ${stats.active_calls} active` : ''}`} />
              <MiniStat label="Est. Cost" value={fmtCost(stats.total_cost_usd)} sub="this selection" />
              <MiniStat label="Total Tokens" value={fmtNum(stats.total_tokens)}
                sub={`${fmtNum(stats.prompt_tokens)} prompt \u00B7 ${fmtNum(stats.completion_tokens)} compl`} />
              <MiniStat label="Avg Latency"
                value={stats.avg_latency_ms > 0 ? fmtLatency(stats.avg_latency_ms) : '\u2014'}
                sub="per completed call" />
              <MiniStat label="Rounds" value={String(stats.rounds)}
                sub={`${stats.calls_in_latest_round} calls in latest`} />
            </div>

            {/* Token Split | Model Split | Cost by Type */}
            <div className="flex gap-2.5 flex-wrap">
              {/* Token Split */}
              <div className="flex-[2] min-w-[180px] sf-surface-elevated rounded p-3">
                <div className="sf-text-nano font-semibold tracking-wider uppercase sf-text-muted mb-2">Token Split</div>
                <div className="h-2 rounded overflow-hidden sf-surface-panel flex mb-2">
                  <div className="h-full sf-bar-prompt" style={{ width: `${promptPct}%` }} />
                  <div className="h-full sf-bar-completion" style={{ width: `${completionPct}%` }} />
                </div>
                <div className="flex justify-between sf-text-caption">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm sf-bar-prompt inline-block" />
                    <span className="sf-text-muted">Prompt {promptPct}%</span>
                    <span className="sf-text-dim font-mono sf-text-nano">({fmtNum(stats.prompt_tokens)})</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="sf-text-dim font-mono sf-text-nano">({fmtNum(stats.completion_tokens)})</span>
                    <span className="sf-text-muted">{completionPct}% Completion</span>
                    <span className="w-2 h-2 rounded-sm sf-bar-completion inline-block" />
                  </span>
                </div>
              </div>

              {/* Model Split */}
              <div className="flex-1 min-w-[140px] sf-surface-elevated rounded p-3">
                <div className="sf-text-nano font-semibold tracking-wider uppercase sf-text-muted mb-2">Model Split</div>
                {stats.by_model.map((m) => (
                  <div key={m.model} className="flex items-center gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${modelChipClass(m.model)}`}>
                      {shortModel(m.model)}
                    </span>
                    <span className="sf-text-caption sf-text-muted">{m.calls} calls</span>
                    <span className="flex-1" />
                    <span className="sf-text-caption font-semibold font-mono sf-text-primary">{fmtCost(m.cost_usd)}</span>
                  </div>
                ))}
                {stats.by_model.length === 0 && <span className="sf-text-caption sf-text-dim">no models yet</span>}
              </div>

              {/* Cost by Call Type */}
              <div className="flex-[2] min-w-[180px] sf-surface-elevated rounded p-3">
                <div className="sf-text-nano font-semibold tracking-wider uppercase sf-text-muted mb-2">Cost by Call Type</div>
                {stats.by_call_type.slice(0, 6).map((ct) => {
                  const meta = ctMeta(ct.call_type);
                  const maxCost = stats.by_call_type[0]?.cost_usd || 1;
                  const w = Math.max(2, Math.round((ct.cost_usd / maxCost) * 100));
                  return (
                    <div key={ct.call_type} className="mb-1.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="sf-text-caption font-medium sf-text-primary">{meta.symbol} {meta.label}</span>
                        <span className="sf-text-caption font-semibold font-mono sf-text-primary">{fmtCost(ct.cost_usd)}</span>
                      </div>
                      <div className="h-[3px] rounded sf-surface-panel">
                        <div className={`h-full rounded ${meta.barClass}`} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  );
                })}
                {stats.by_call_type.length === 0 && <span className="sf-text-caption sf-text-dim">no calls yet</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Calls Table ── */}
      <div className="sf-surface-card p-4">
        <div className="sf-table-shell rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="sf-table-head">
                <th className="sf-table-head-cell text-left px-2 py-2 w-9">#</th>
                <th className="sf-table-head-cell text-left px-2 py-2" style={{ width: 140 }}>Type</th>
                <th className="sf-table-head-cell text-left px-2 py-2 w-10">Rnd</th>
                <th className="sf-table-head-cell text-left px-2 py-2" style={{ width: 110 }}>Model</th>
                <th className="sf-table-head-cell text-left px-2 py-2">Input</th>
                <th className="sf-table-head-cell text-left px-2 py-2">Output</th>
                <th className="sf-table-head-cell text-right px-2 py-2" style={{ width: 72 }}>Tokens</th>
                <th className="sf-table-head-cell text-right px-2 py-2" style={{ width: 64 }}>Cost</th>
                <th className="sf-table-head-cell text-right px-2 py-2" style={{ width: 52 }}>Dur</th>
                <th className="sf-table-head-cell text-center px-2 py-2" style={{ width: 72 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center sf-text-muted">
                    No LLM calls{activeFilter !== 'all' ? ' match this filter' : ' yet'}
                  </td>
                </tr>
              )}
              {roundGroups.map((g) => (
                <RoundGroup
                  key={g.round}
                  round={g.round}
                  calls={g.calls}
                  expandedRows={expandedRows}
                  onToggleRow={toggleRow}
                  onTabClick={handleTabClick}
                  totalRounds={stats.rounds}
                  highlightWorkerId={highlightWorkerId}
                  allCalls={calls}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Mini Stat ────────────────────────────────────────────────────────────────

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex-1 min-w-[110px] sf-surface-elevated rounded px-3 py-2.5">
      <div className="sf-text-nano font-semibold tracking-wider uppercase sf-text-muted mb-0.5">{label}</div>
      <div className="text-lg font-bold sf-text-primary leading-tight tabular-nums">{value}</div>
      <div className="sf-text-caption sf-text-dim">{sub}</div>
    </div>
  );
}

// ── Round Group ──────────────────────────────────────────────────────────────

function RoundGroup({ round, calls, expandedRows, onToggleRow, onTabClick, totalRounds, highlightWorkerId, allCalls }: {
  round: number;
  calls: LlmCallRow[];
  expandedRows: Record<string, boolean>;
  onToggleRow: (workerId: string) => void;
  onTabClick: (tab: PrefetchTabKey, e: React.MouseEvent) => void;
  totalRounds: number;
  highlightWorkerId: string | null;
  allCalls: LlmCallRow[];
}) {
  const roundTotal = allCalls.filter((c) => c.round === round).length;
  return (
    <>
      {totalRounds > 1 && (
        <tr>
          <td colSpan={10} className="py-1.5 px-2 sf-surface-panel border-b sf-border-soft">
            <div className="flex items-center gap-2">
              <span className="sf-text-caption font-semibold sf-text-muted">Round {round}</span>
              <div className="flex-1 h-px sf-border-soft border-b" />
              <span className="sf-text-caption sf-text-dim">{roundTotal} calls</span>
            </div>
          </td>
        </tr>
      )}
      {calls.map((call) => (
        <CallRow
          key={call.worker_id}
          call={call}
          expanded={expandedRows[call.worker_id] === true}
          onToggle={() => onToggleRow(call.worker_id)}
          onTabClick={onTabClick}
          isHighlighted={call.worker_id === highlightWorkerId}
        />
      ))}
    </>
  );
}

// ── Call Row ─────────────────────────────────────────────────────────────────

function CallRow({ call, expanded, onToggle, onTabClick, isHighlighted }: {
  call: LlmCallRow;
  expanded: boolean;
  onToggle: () => void;
  onTabClick: (tab: PrefetchTabKey, e: React.MouseEvent) => void;
  isHighlighted: boolean;
}) {
  const meta = ctMeta(call.call_type);
  const isActive = call.status === 'active';
  const isFailed = call.status === 'failed';
  const promptP = pctOf(call.prompt_tokens, call.total_tokens);

  return (
    <>
      <tr
        className={`border-t sf-border-soft sf-table-row cursor-pointer ${
          isActive ? 'sf-table-row-streaming' : ''
        } ${isFailed ? 'sf-table-row-danger' : ''
        } ${isHighlighted ? 'sf-table-row-highlight' : ''}`}
        onClick={onToggle}
      >
        <td className="px-2 py-2.5 sf-text-dim font-mono">{call.index}</td>
        <td className="px-2 py-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded sf-text-caption font-semibold ${meta.chipClass}`}>
            <span className="sf-text-nano">{meta.symbol}</span>
            {meta.label}
          </span>
        </td>
        <td className="px-2 py-2.5 sf-text-muted">{call.round}</td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-1">
            <span className={`px-1 py-0.5 rounded sf-text-nano font-bold uppercase tracking-wider ${accessBadgeClass(Boolean(call.is_lab))}`}>
              {accessBadgeLabel(Boolean(call.is_lab))}
            </span>
            <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${modelChipClass(call.model)}`}>
              {call.model ? shortModel(call.model) : '\u2014'}
            </span>
            {call.is_fallback && (
              <span className="px-1.5 py-0.5 rounded sf-text-nano font-bold sf-chip-danger uppercase tracking-wider">
                fallback
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-2.5 sf-text-muted truncate max-w-[16rem]" title={call.prompt_preview ?? undefined}>
          {formatInputPreview(call)}
        </td>
        <td className="px-2 py-2.5 sf-text-dim truncate max-w-[16rem]" title={call.response_preview ?? undefined}>
          {isActive ? <div className="sf-shimmer h-2.5 w-3/4 rounded" /> : formatOutputPreview(call)}
        </td>
        <td className="px-2 py-2.5 text-right">
          <div className="flex items-center gap-1.5 justify-end">
            <TokenBar promptPct={promptP} />
            <span className="font-mono sf-text-muted font-medium">{fmtNum(call.total_tokens)}</span>
          </div>
          {isActive && (
            <span className="animate-pulse sf-text-nano sf-chip-purple font-medium px-1 py-0 rounded mt-0.5 inline-block">
              streaming&hellip;
            </span>
          )}
        </td>
        <td className="px-2 py-2.5 text-right font-mono font-semibold sf-text-primary" title={call.estimated_usage ? 'Estimated from content' : undefined}>
          {call.estimated_usage ? '~' : ''}{fmtCost(call.estimated_cost, isActive)}
        </td>
        <DurationCell call={call} />
        <td className="px-2 py-2 text-right">
          <div className="flex items-center gap-1 justify-end">
            {meta.tabCode && meta.prefetchTab && (
              <button
                onClick={(e) => onTabClick(meta.prefetchTab!, e)}
                className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-icon-button border sf-border-soft"
                aria-label={`Open ${meta.label}`}
                title={`Open ${meta.label}`}
              >
                {'\u2192'}{meta.tabCode}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className={`px-1.5 py-0.5 rounded sf-text-caption ${
                expanded ? 'sf-chip-active' : 'sf-icon-button border sf-border-soft'
              }`}
            >
              {expanded ? '\u25B2' : '\u25BC'}
            </button>
          </div>
        </td>
      </tr>

      {/* ── Expanded Detail ── */}
      {expanded && (
        <tr className="border-t sf-border-soft">
          <td colSpan={10} className="p-3 sf-surface-panel">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_200px] gap-3">
              {/* Prompt */}
              <div>
                <div className="sf-text-nano font-bold sf-text-muted uppercase tracking-wider mb-1.5">Prompt</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-x-auto overflow-y-auto max-h-[150px] whitespace-pre-wrap leading-relaxed">
                  {call.prompt_preview || '(no preview)'}
                </pre>
              </div>

              {/* Response */}
              <div>
                <div className="sf-text-nano font-bold sf-text-muted uppercase tracking-wider mb-1.5">
                  Response Preview{isActive && <span className="normal-case animate-pulse ml-1"> &middot; streaming&hellip;</span>}
                </div>
                {isActive ? (
                  <div className="sf-pre-block rounded p-3 flex items-center gap-2 sf-text-caption">
                    <span className="w-[7px] h-[7px] rounded-full sf-chip-purple animate-pulse inline-block shrink-0" />
                    <span className="sf-text-muted font-mono">Waiting for completion&hellip;</span>
                  </div>
                ) : (
                  <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-x-auto overflow-y-auto max-h-[150px] whitespace-pre-wrap leading-relaxed">
                    {call.response_preview || '(no preview)'}
                  </pre>
                )}
              </div>

              {/* Meta sidebar */}
              <div className="space-y-2">
                <div className="sf-surface-elevated rounded p-3 space-y-1">
                  <div className="sf-text-nano font-bold sf-text-muted uppercase tracking-wider mb-1.5">Tokens &amp; Cost</div>
                  <MetaRow label="Prompt tokens" value={fmtNum(call.prompt_tokens)} />
                  <MetaRow label="Completion tokens" value={fmtNum(call.completion_tokens)} />
                  <MetaRow label="Total" value={fmtNum(call.total_tokens)} />
                  <div className="border-t sf-border-soft pt-1.5 mt-1">
                    <MetaRow label="Est. cost" value={fmtCost(call.estimated_cost, isActive)} bold />
                  </div>
                </div>
                <div className="sf-surface-elevated rounded p-3 space-y-1">
                  <div className="sf-text-nano font-bold sf-text-muted uppercase tracking-wider mb-1.5">Metadata</div>
                  <MetaRow label="Call Type" value={call.call_type || '\u2014'} />
                  <MetaRow label="Model" value={shortModel(call.model)} />
                  <MetaRow label="Access" value={call.is_lab ? 'Lab' : 'API'} />
                  <MetaRow label="Provider" value={call.provider || '\u2014'} />
                  <MetaRow label="Round" value={`Round ${call.round}`} />
                  <MetaRow label="Duration" value={fmtDur(call.duration_ms, isActive)} />
                  {call.is_fallback && <MetaRow label="Fallback" value="Yes" />}
                  <MetaRow label="Worker ID" value={call.worker_id} />
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Shared tiny components ───────────────────────────────────────────────────

function MetaRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-0.5">
      <span className="sf-text-muted">{label}</span>
      <span className={`sf-text-primary font-mono sf-text-caption ${bold ? 'font-bold' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

function TokenBar({ promptPct }: { promptPct: number }) {
  return (
    <div className="w-12 h-1 rounded overflow-hidden sf-surface-panel flex shrink-0">
      <div className="h-full sf-bar-prompt" style={{ width: `${promptPct}%` }} />
      <div className="h-full sf-bar-completion" style={{ width: `${100 - promptPct}%` }} />
    </div>
  );
}

function LiveTimer({ startTs }: { startTs: string }) {
  const [elapsed, setElapsed] = useState(() => {
    const start = new Date(startTs).getTime();
    return Number.isFinite(start) ? Math.max(0, (Date.now() - start) / 1000) : 0;
  });
  useEffect(() => {
    const start = new Date(startTs).getTime();
    if (!Number.isFinite(start)) return;
    const id = setInterval(() => setElapsed(Math.max(0, (Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTs]);
  return <span className="animate-pulse">{elapsed.toFixed(0)}s</span>;
}

function fmtSec(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '\u2014';
  return `${(ms / 1000).toFixed(1)}s`;
}

function DurationCell({ call }: { call: LlmCallRow }) {
  const isActive = call.status === 'active';
  const dur = call.duration_ms;
  const primaryDur = call.primary_duration_ms;
  if (isActive) {
    return (
      <td className="px-2 py-2.5 text-right font-mono sf-text-muted">
        <LiveTimer startTs={call.ts} />
      </td>
    );
  }
  const slow = dur != null && dur > 3000;
  // WHY: Fallback calls show both primary attempt + fallback duration
  if (call.is_fallback && primaryDur != null && primaryDur > 0) {
    return (
      <td className="px-2 py-2.5 text-right font-mono sf-text-muted">
        <span className="sf-text-dim line-through" title="Primary attempt (failed)">{fmtSec(primaryDur)}</span>
        {' '}
        <span className={slow ? 'sf-text-amber font-semibold' : ''} title="Fallback duration">{fmtSec(dur)}</span>
      </td>
    );
  }
  return (
    <td className={`px-2 py-2.5 text-right font-mono ${slow ? 'sf-text-amber font-semibold' : 'sf-text-muted'}`}>
      {fmtSec(dur)}
    </td>
  );
}
