import { useMemo, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../../api/client.ts';
import { getRefetchInterval } from '../../helpers.ts';
import { usePersistedTab, usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { LlmWorkerResponse, LlmCallRow, LlmWorkerSummary, PrefetchTabKey, RuntimeIdxBadge } from '../../types.ts';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { shortModel, modelChipClass, accessBadgeClass, accessBadgeLabel } from '../../selectors/llmModelHelpers.ts';
import {
  type CallTypeDef, type DonutSegment, type NarrativeData,
  CALL_TYPE_ORDER, FILTER_GROUPS,
  ctMeta, fmtNum, fmtCost, fmtDur, fmtLatency, fmtSec, fmtCompact, pctOf,
  formatInputPreview, formatOutputPreview,
  computeFilteredStats, groupByRound, computeDonutSegments, buildNarrative,
} from './llmDashboardHelpers.ts';

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
  const [expandedRows, toggleExpandedRow] = usePersistedExpandMap(`runtimeOps:llmDash:expandedRows:${category}`);
  const heroScrollRef = usePersistedScroll(`scroll:llmDash:hero:${category}`);
  const logScrollRef = usePersistedScroll(`scroll:llmDash:log:${category}`);

  const { data: dashboard } = useQuery({
    queryKey: ['runtime-ops', runId, 'llm-dashboard'],
    queryFn: () => api.get<LlmWorkerResponse>(`/indexlab/run/${runId}/runtime/llm-dashboard`),
    enabled: Boolean(runId),
    refetchInterval: getRefetchInterval(isRunning, false, 3000, 15000),
  });

  const calls = dashboard?.calls ?? [];
  const summary = dashboard?.summary ?? null;

  const filteredCalls = useMemo(() => {
    if (activeFilter === 'all') return calls;
    return calls.filter((c) => c.call_type === activeFilter);
  }, [calls, activeFilter]);

  const highlightedCall = useMemo(
    () => calls.find((call) => call.worker_id === highlightWorkerId) ?? null,
    [calls, highlightWorkerId],
  );

  const stats = useMemo(
    () => computeFilteredStats(filteredCalls, summary, activeFilter),
    [filteredCalls, activeFilter, summary],
  );

  const roundGroups = useMemo(() => groupByRound(filteredCalls), [filteredCalls]);

  const handleTabClick = (tab: PrefetchTabKey, e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenPrefetchTab(tab);
  };

  // WHY: Count calls per type for filter badges (computed from unfiltered list)
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of calls) m[c.call_type] = (m[c.call_type] || 0) + 1;
    return m;
  }, [calls]);

  // WHY: Count lab vs api for footer
  const labCount = useMemo(() => calls.filter((c) => c.is_lab).length, [calls]);
  const fallbackCount = useMemo(() => calls.filter((c) => c.is_fallback).length, [calls]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Pinned top: hero + filter (scrolls internally only if needed) */}
      <div ref={heroScrollRef} className="shrink-0 overflow-y-auto max-h-[55vh] p-4 pb-0 space-y-4">
        <HeroBandSection
          stats={stats}
          highlightedCall={highlightedCall}
          idxRuntime={idxRuntime}
          labCount={labCount}
          apiCount={calls.length - labCount}
          fallbackCount={fallbackCount}
        />
        <FilterRibbon
          calls={calls}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          typeCounts={typeCounts}
        />
      </div>
      {/* Call log: fills remaining space, scrolls independently */}
      <div ref={logScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 pt-4">
        <CallLogSection
          roundGroups={roundGroups}
          filteredCount={filteredCalls.length}
          totalRounds={stats.rounds}
          expandedRows={expandedRows}
          onToggleRow={toggleExpandedRow}
          onTabClick={handleTabClick}
          highlightWorkerId={highlightWorkerId}
          allCalls={calls}
          activeFilter={activeFilter}
        />
      </div>
    </div>
  );
}

// ── Hero Band Section ─────────────────────────────────────────────────────��──

function HeroBandSection({ stats, highlightedCall, idxRuntime, labCount, apiCount, fallbackCount }: {
  stats: LlmWorkerSummary;
  highlightedCall: LlmCallRow | null;
  idxRuntime?: RuntimeIdxBadge[];
  labCount: number;
  apiCount: number;
  fallbackCount: number;
}) {
  const narrative = useMemo(() => buildNarrative(stats), [stats]);
  const donutSegments = useMemo(() => computeDonutSegments(stats.by_model), [stats.by_model]);
  const promptPct = pctOf(stats.prompt_tokens, stats.total_tokens);

  return (
    <HeroBand
      titleRow={<>
        <span className="text-[26px] font-bold sf-text-primary">LLM Dashboard</span>
        <span className="text-[20px] sf-text-muted italic">&middot; Call Analytics</span>
        {stats.active_calls > 0 && (
          <Chip label={`${stats.active_calls} streaming`} className="sf-chip-purple animate-pulse" />
        )}
      </>}
      trailing={highlightedCall ? <>
        <Chip label={accessBadgeLabel(Boolean(highlightedCall.is_lab))} className={accessBadgeClass(Boolean(highlightedCall.is_lab))} />
        {highlightedCall.model && (
          <Chip label={shortModel(highlightedCall.model)} className={modelChipClass(highlightedCall.model)} />
        )}
      </> : undefined}
      footer={<>
        <span>Prompt tokens: <strong className="sf-text-primary">{fmtNum(stats.prompt_tokens)}</strong></span>
        <span>Completion tokens: <strong className="sf-text-primary">{fmtNum(stats.completion_tokens)}</strong></span>
        <span>Calls in latest round: <strong className="sf-text-primary">{stats.calls_in_latest_round}</strong></span>
        <span>Lab: <strong className="sf-text-primary">{labCount}</strong> &middot; API: <strong className="sf-text-primary">{apiCount}</strong></span>
        {fallbackCount > 0 && <span>Fallbacks: <strong className="sf-text-primary">{fallbackCount}</strong></span>}
      </>}
    >
      <RuntimeIdxBadgeStrip badges={idxRuntime} />

      <HeroStatGrid columns={6}>
        <HeroStat value={stats.total_calls} label="total calls" />
        <HeroStat value={stats.completed_calls} label="completed" colorClass="text-[var(--sf-token-state-success-fg)]" />
        <HeroStat value={fmtCost(stats.total_cost_usd)} label="est. cost" colorClass="text-[var(--sf-token-state-warning-fg)]" />
        <HeroStat value={fmtCompact(stats.total_tokens)} label="total tokens" colorClass="sf-text-primary" />
        <HeroStat value={stats.avg_latency_ms > 0 ? fmtLatency(stats.avg_latency_ms) : '\u2014'} label="avg latency" colorClass="text-[var(--sf-token-state-info-fg)]" />
        <HeroStat value={stats.rounds} label="rounds" colorClass="sf-text-primary" />
      </HeroStatGrid>

      {/* Narrative */}
      <div className="text-sm sf-text-muted italic max-w-3xl">
        Completed <strong className="sf-text-primary not-italic">{narrative.completed}</strong> LLM calls across{' '}
        <strong className="sf-text-primary not-italic">{narrative.rounds}</strong> rounds using{' '}
        <strong className="sf-text-primary not-italic">{narrative.modelCount}</strong> models.{' '}
        {narrative.topType !== 'N/A' && <>
          {narrative.topType} accounts for <strong className="sf-text-primary not-italic">{narrative.topPct}%</strong> of total cost.{' '}
        </>}
        Average latency <strong className="sf-text-primary not-italic">{narrative.avgLatency}</strong> per call
        with <strong className="sf-text-primary not-italic">{narrative.latestRoundCalls}</strong> calls in the latest round.
      </div>

      {/* Visuals Row */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_1.6fr] gap-4">
        <TokenSplitCard stats={stats} promptPct={promptPct} />
        <ModelDonut segments={donutSegments} modelCount={stats.by_model.length} />
        <CostByCallTypeCard byCallType={stats.by_call_type} />
      </div>
    </HeroBand>
  );
}

// ── Token Split Card ─────────────────────────────────────────────────────────

function TokenSplitCard({ stats, promptPct }: { stats: LlmWorkerSummary; promptPct: number }) {
  const completionPct = 100 - promptPct;
  return (
    <div className="sf-surface-panel rounded-lg p-4 border sf-border-soft">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-3">Token Split</div>
      <div className="h-2 rounded overflow-hidden sf-surface-elevated flex mb-2.5">
        <div className="h-full sf-bar-prompt" style={{ width: `${promptPct}%` }} />
        <div className="h-full sf-bar-completion" style={{ width: `${completionPct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] mb-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm sf-bar-prompt inline-block" />
          <span className="sf-text-muted">Prompt {promptPct}%</span>
          <span className="sf-text-dim font-mono text-[10px]">({fmtNum(stats.prompt_tokens)})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="sf-text-dim font-mono text-[10px]">({fmtNum(stats.completion_tokens)})</span>
          <span className="sf-text-muted">{completionPct}% Completion</span>
          <span className="w-2 h-2 rounded-sm sf-bar-completion inline-block" />
        </span>
      </div>
      {/* Per-model token breakdown */}
      {stats.by_model.map((m) => {
        const mPct = stats.total_tokens > 0 ? Math.round(((m.calls / stats.total_calls) * 100)) : 0;
        return (
          <div key={m.model} className="flex items-center gap-2 py-1">
            <span className="text-[10px] sf-text-dim w-[76px] shrink-0 truncate">{shortModel(m.model)}</span>
            <div className="flex-1 h-1 rounded sf-surface-elevated overflow-hidden">
              <div className={`h-full rounded ${modelChipClass(m.model).replace('sf-chip-', 'sf-bar-ct-').replace('sf-bar-ct-info', 'sf-bar-ct-brand-resolver').replace('sf-bar-ct-success', 'sf-bar-ct-candidate-valid')}`} style={{ width: `${mPct}%` }} />
            </div>
            <span className="text-[10px] font-mono font-semibold sf-text-muted w-[52px] text-right shrink-0">{fmtNum(m.calls * (stats.total_tokens / stats.total_calls))}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Model Donut (shared component) ───────────────────────────────────────────

import { ModelDonut as ModelDonutShared } from '../../components/ModelDonut.tsx';

function ModelDonut({ segments, modelCount }: { segments: DonutSegment[]; modelCount: number }) {
  return (
    <div className="sf-surface-panel rounded-lg p-4 border sf-border-soft flex flex-col items-center gap-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted self-start">Model Split</div>
      <ModelDonutShared segments={segments} centerLabel={modelCount} centerCaption="models" />
    </div>
  );
}

// ── Cost by Call Type Card ───────────────────────────────────────────────────

function CostByCallTypeCard({ byCallType }: { byCallType: Array<{ call_type: string; cost_usd: number }> }) {
  const maxCost = byCallType[0]?.cost_usd || 1;
  return (
    <div className="sf-surface-panel rounded-lg p-4 border sf-border-soft">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-3">Cost by Call Type</div>
      {byCallType.slice(0, 6).map((ct) => {
        const meta = ctMeta(ct.call_type);
        const w = Math.max(2, Math.round((ct.cost_usd / maxCost) * 100));
        return (
          <div key={ct.call_type} className="mb-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] font-semibold sf-text-primary">{meta.symbol} {meta.label}</span>
              <span className="text-[11px] font-mono font-bold sf-text-primary">{fmtCost(ct.cost_usd)}</span>
            </div>
            <div className="h-1 rounded sf-surface-elevated">
              <div className={`h-full rounded ${meta.barClass}`} style={{ width: `${w}%` }} />
            </div>
          </div>
        );
      })}
      {byCallType.length === 0 && <span className="text-[11px] sf-text-dim">no calls yet</span>}
    </div>
  );
}

// ── Filter Ribbon ────────────────────────────────────────────────────────────

function FilterRibbon({ calls, activeFilter, onFilterChange, typeCounts }: {
  calls: LlmCallRow[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  typeCounts: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center sf-surface-panel border sf-border-soft rounded-lg px-3 py-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-dim pr-1">Filter</span>
      <button
        onClick={() => onFilterChange('all')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
          activeFilter === 'all'
            ? 'sf-chip-active font-semibold'
            : 'sf-chip-default'
        }`}
      >
        All
        <span className={`font-mono text-[10px] px-1.5 py-0 rounded ${activeFilter === 'all' ? 'sf-chip-active' : 'sf-chip-default'}`}>
          {calls.length}
        </span>
      </button>
      {FILTER_GROUPS.map((group, gi) => (
        <FilterGroup key={group.label} group={group} activeFilter={activeFilter} onFilterChange={onFilterChange} typeCounts={typeCounts} showSep={true} />
      ))}
    </div>
  );
}

function FilterGroup({ group, activeFilter, onFilterChange, typeCounts, showSep }: {
  group: { label: string; types: string[] };
  activeFilter: string;
  onFilterChange: (f: string) => void;
  typeCounts: Record<string, number>;
  showSep: boolean;
}) {
  return (
    <>
      {showSep && <div className="w-px h-[18px] sf-border-soft bg-[var(--sf-surface-border)] mx-0.5" />}
      {group.types.map((ct) => {
        const meta = ctMeta(ct);
        const isOn = activeFilter === ct;
        const count = typeCounts[ct] || 0;
        return (
          <button
            key={ct}
            onClick={() => onFilterChange(ct)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
              isOn ? 'sf-chip-active font-semibold' : 'sf-chip-default'
            }`}
          >
            <span className={`text-xs leading-none ${isOn ? '' : ''}`} style={{ color: isOn ? 'var(--sf-token-accent-strong)' : undefined }}>
              {meta.symbol}
            </span>
            {meta.label}
            {count > 0 && (
              <span className={`font-mono text-[10px] px-1.5 py-0 rounded ${isOn ? 'sf-chip-active' : 'sf-chip-default'}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

// ── Call Log Section ─────────────────────────────────────────────────────────

function CallLogSection({ roundGroups, filteredCount, totalRounds, expandedRows, onToggleRow, onTabClick, highlightWorkerId, allCalls, activeFilter }: {
  roundGroups: Array<{ round: number; calls: LlmCallRow[] }>;
  filteredCount: number;
  totalRounds: number;
  expandedRows: Record<string, boolean>;
  onToggleRow: (workerId: string) => void;
  onTabClick: (tab: PrefetchTabKey, e: React.MouseEvent) => void;
  highlightWorkerId: string | null;
  allCalls: LlmCallRow[];
  activeFilter: string;
}) {
  return (
    <div className="sf-table-shell rounded overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b sf-border-soft sf-table-head">
        <span className="sf-table-head-cell p-0 border-0">Call Log</span>
        <span className="sf-table-head-cell p-0 border-0 font-mono">{filteredCount} calls &middot; {totalRounds} rounds</span>
      </div>

      {filteredCount === 0 && (
        <div className="py-8 text-center sf-text-muted text-sm">
          No LLM calls{activeFilter !== 'all' ? ' match this filter' : ' yet'}
        </div>
      )}

      {roundGroups.map((g) => (
        <RoundGroup
          key={g.round}
          round={g.round}
          calls={g.calls}
          expandedRows={expandedRows}
          onToggleRow={onToggleRow}
          onTabClick={onTabClick}
          totalRounds={totalRounds}
          highlightWorkerId={highlightWorkerId}
          allCalls={allCalls}
        />
      ))}
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
        <div className="flex items-center gap-2.5 px-4 py-2 sf-surface-panel border-b sf-border-soft">
          <span className="text-[11px] font-bold sf-text-muted whitespace-nowrap">Round {round}</span>
          <div className="flex-1 h-px sf-border-soft border-b" />
          <span className="text-[10px] font-mono sf-text-dim">{roundTotal} calls</span>
        </div>
      )}
      {calls.map((call) => (
        <CallCard
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

// ── Call Card ─────────────────────────────────────────────────────────────────

function CallCard({ call, expanded, onToggle, onTabClick, isHighlighted }: {
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

  const stateClass = isActive ? 'sf-table-row sf-table-row-streaming border-l-[3px] border-l-[var(--sf-token-state-run-ai-fg)] pl-[13px]'
    : isFailed ? 'sf-table-row sf-table-row-danger border-l-[3px] border-l-[var(--sf-token-state-error-fg)] pl-[13px]'
    : isHighlighted ? 'sf-table-row sf-table-row-highlight border-l-[3px] border-l-[var(--sf-token-accent)] pl-[13px]'
    : 'sf-table-row pl-4';

  return (
    <>
      <div
        className={`grid grid-cols-[36px_1fr_1fr_100px_72px_56px_40px] items-center py-2.5 pr-4 border-b sf-border-soft cursor-pointer ${stateClass}`}
        onClick={onToggle}
      >
        <span className="font-mono text-[11px] sf-text-dim font-medium">{call.index}</span>

        {/* Identity: type chip + model */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${meta.chipClass}`}>
            <span className="text-[12px]">{meta.symbol}</span>
            {meta.label}
          </span>
          <span className={`px-1 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${accessBadgeClass(Boolean(call.is_lab))}`}>
            {accessBadgeLabel(Boolean(call.is_lab))}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${modelChipClass(call.model)}`}>
            {call.model ? shortModel(call.model) : '\u2014'}
          </span>
          {call.is_fallback && (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider sf-chip-danger">fallback</span>
          )}
        </div>

        {/* Preview */}
        <span className="text-[11px] sf-text-dim truncate px-2 min-w-0" title={call.prompt_preview ?? undefined}>
          {isActive ? <div className="sf-shimmer h-2 w-3/4 rounded" /> : formatInputPreview(call)}
        </span>

        {/* Tokens */}
        <div className="flex items-center gap-1.5 justify-end">
          <TokenBar promptPct={promptP} />
          <span className={`font-mono text-[10px] font-semibold ${isActive ? 'sf-chip-purple' : 'sf-text-muted'}`}>
            {fmtNum(call.total_tokens)}
          </span>
        </div>

        {/* Cost */}
        <span className="font-mono text-[11px] font-bold sf-text-primary text-right" title={call.estimated_usage ? 'Estimated from content' : undefined}>
          {isActive ? '\u2014' : <>{call.estimated_usage ? '~' : ''}{fmtCost(call.estimated_cost)}</>}
        </span>

        {/* Duration */}
        <DurationCell call={call} />

        {/* Expand */}
        <div className="flex justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] transition-all ${
              expanded
                ? 'sf-chip-active border border-current'
                : 'sf-icon-button border sf-border-soft'
            }`}
          >
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && <CallDetail call={call} onTabClick={onTabClick} />}
    </>
  );
}

// ── Call Detail (expanded) ───────────────────────────────────────────────────

function CallDetail({ call, onTabClick }: {
  call: LlmCallRow;
  onTabClick: (tab: PrefetchTabKey, e: React.MouseEvent) => void;
}) {
  const meta = ctMeta(call.call_type);
  const isActive = call.status === 'active';

  return (
    <div className="p-3 sf-table-expanded-row border-b sf-border-soft">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_200px] gap-3 items-stretch">
        {/* Prompt */}
        <div className="flex flex-col min-h-0">
          <div className="text-[9px] font-extrabold sf-text-dim uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5 shrink-0">
            Prompt
            {meta.tabCode && meta.prefetchTab && (
              <button
                onClick={(e) => onTabClick(meta.prefetchTab!, e)}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold sf-icon-button border sf-border-soft"
                title={`Open ${meta.label}`}
              >
                {'\u2192'}{meta.tabCode}
              </button>
            )}
          </div>
          <pre className="sf-pre-block text-[11px] font-mono rounded-md p-3 overflow-x-auto overflow-y-auto flex-1 whitespace-pre-wrap leading-relaxed">
            {call.prompt_preview || '(no preview)'}
          </pre>
        </div>

        {/* Response */}
        <div className="flex flex-col min-h-0">
          <div className="text-[9px] font-extrabold sf-text-dim uppercase tracking-[0.08em] mb-2 shrink-0">
            Response{isActive && <span className="normal-case animate-pulse ml-1 sf-text-muted"> &middot; streaming&hellip;</span>}
          </div>
          {isActive ? (
            <div className="sf-pre-block rounded-md p-3 flex items-center gap-2 text-[11px] flex-1">
              <span className="w-[7px] h-[7px] rounded-full sf-chip-purple animate-pulse inline-block shrink-0" />
              <span className="sf-text-muted font-mono">Waiting for completion&hellip;</span>
            </div>
          ) : (
            <pre className="sf-pre-block text-[11px] font-mono rounded-md p-3 overflow-x-auto overflow-y-auto flex-1 whitespace-pre-wrap leading-relaxed">
              {call.response_preview || '(no preview)'}
            </pre>
          )}
        </div>

        {/* Meta sidebar */}
        <div className="space-y-2">
          <div className="sf-surface-elevated rounded p-3 space-y-1">
            <div className="text-[9px] font-extrabold sf-text-dim uppercase tracking-[0.08em] mb-1.5">Tokens &amp; Cost</div>
            <MetaRow label="Prompt tokens" value={fmtNum(call.prompt_tokens)} />
            <MetaRow label="Completion tokens" value={fmtNum(call.completion_tokens)} />
            <MetaRow label="Total" value={fmtNum(call.total_tokens)} />
            <div className="border-t sf-border-soft pt-1.5 mt-1">
              <MetaRow label="Est. cost" value={fmtCost(call.estimated_cost, isActive)} bold />
            </div>
          </div>
          <div className="sf-surface-elevated rounded p-3 space-y-1">
            <div className="text-[9px] font-extrabold sf-text-dim uppercase tracking-[0.08em] mb-1.5">Metadata</div>
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
    </div>
  );
}

// ── Shared micro-components ──────────────────────────────────────────────────

function MetaRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-0.5">
      <span className="sf-text-muted text-[11px]">{label}</span>
      <span className={`sf-text-primary font-mono text-[11px] ${bold ? 'font-bold' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

function TokenBar({ promptPct }: { promptPct: number }) {
  return (
    <div className="w-9 h-[3px] rounded overflow-hidden sf-surface-panel flex shrink-0">
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

function DurationCell({ call }: { call: LlmCallRow }) {
  const isActive = call.status === 'active';
  const dur = call.duration_ms;
  const primaryDur = call.primary_duration_ms;

  if (isActive) {
    return (
      <span className="font-mono text-[11px] sf-text-muted text-right">
        <LiveTimer startTs={call.ts} />
      </span>
    );
  }

  const slow = dur != null && dur > 3000;

  // WHY: Fallback calls show both primary attempt + fallback duration
  if (call.is_fallback && primaryDur != null && primaryDur > 0) {
    return (
      <span className="font-mono text-[11px] sf-text-muted text-right">
        <span className="sf-text-dim line-through" title="Primary attempt (failed)">{fmtSec(primaryDur)}</span>
        {' '}
        <span className={slow ? 'text-[var(--sf-token-state-warning-fg)] font-bold' : ''} title="Fallback duration">{fmtSec(dur)}</span>
      </span>
    );
  }

  return (
    <span className={`font-mono text-[11px] text-right ${slow ? 'text-[var(--sf-token-state-warning-fg)] font-bold' : 'sf-text-muted'}`}>
      {fmtSec(dur)}
    </span>
  );
}
