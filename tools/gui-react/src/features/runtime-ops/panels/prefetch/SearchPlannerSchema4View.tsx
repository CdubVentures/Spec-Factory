import { useMemo } from 'react';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import type { PrefetchLlmCall, SearchPlanPass, PrefetchSearchResult } from '../../types.ts';
import type { RuntimeIdxBadge } from '../../types.ts';
import { llmCallStatusBadgeClass, formatMs } from '../../helpers.ts';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { LlmCallCard } from '../../components/LlmCallCard.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { normalizeToken, normalizeQuery } from './searchPlannerHelpers.ts';

/* ── Props ──────────────────────────────────────────────────────────── */

export interface SearchPlannerSchema4ViewProps {
  calls: PrefetchLlmCall[];
  searchPlans?: SearchPlanPass[];
  searchResults?: PrefetchSearchResult[];
  idxRuntime?: RuntimeIdxBadge[];
  persistScope?: string;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function SearchPlannerSchema4View({
  calls,
  searchPlans,
  searchResults,
  idxRuntime,
  persistScope = '',
}: SearchPlannerSchema4ViewProps) {
  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:searchPlanner:llmCalls:${persistScope}`, false);
  const plans = searchPlans || [];

  const totalQueries = plans.reduce((sum, plan) => sum + plan.queries_generated.length, 0);
  const focusGroupCount = plans.length;
  const familyCount = useMemo(() => {
    const families = new Set<string>();
    for (const plan of plans) {
      const name = String(plan.pass_name || '').trim().toLowerCase();
      if (name) families.add(name);
    }
    return families.size;
  }, [plans]);

  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);
  const hasFailed = calls.some((c) => c.status === 'failed');
  const overallStatus = hasFailed ? 'failed' : 'finished';

  const executedQueryTokens = useMemo(() => new Set(
    (searchResults || []).map((r) => normalizeToken(normalizeQuery(r.query))),
  ), [searchResults]);

  const allQueries = useMemo(() => {
    const rows: { query: string; family: string; targetFields: string[] }[] = [];
    for (const plan of plans) {
      for (const query of plan.queries_generated) {
        const fields = plan.query_target_map?.[query] || [];
        rows.push({ query, family: plan.pass_name || 'default', targetFields: fields });
      }
    }
    return rows;
  }, [plans]);

  const primaryCall = calls[0];

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* Hero Band */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">NeedSet Planner</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Search Plan</span>
          <Chip label={overallStatus.toUpperCase()} className={overallStatus === 'finished' ? 'sf-chip-success' : 'sf-chip-danger'} />
        </>}
        trailing={<>
          <Chip label="Schema 4" className="sf-chip-info" />
          <Chip label="LLM" className="sf-chip-warning" />
          <Tip text="The NeedSet Planner generates targeted search queries to close field coverage gaps identified by the NeedSet. Schema 4 uses a single focused LLM call instead of multi-pass discovery." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={totalQueries} label="queries planned" />
          <HeroStat value={focusGroupCount} label="focus groups" />
          <HeroStat value={familyCount} label="families used" />
          <HeroStat value={calls.length} label="llm calls" colorClass="sf-text-primary" />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          NeedSet planner generated <strong className="sf-text-primary not-italic">{totalQueries}</strong> targeted
          {' '}queries across <strong className="sf-text-primary not-italic">{focusGroupCount}</strong> focus
          {' '}group{focusGroupCount !== 1 ? 's' : ''} to close field coverage gaps
          {totalTokens > 0 && (
            <> &mdash; used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>
          )}
          .
        </div>
      </HeroBand>

      {/* Query Plan */}
      <div>
        <SectionHeader>query plan</SectionHeader>
        {allQueries.length > 0 ? (
          <div className="overflow-x-auto overflow-y-auto max-h-[56rem] border sf-border-soft rounded-sm">
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  {['query', 'family', 'target fields'].map((h) => (
                    <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allQueries.map((row, i) => {
                  const sentToSearch = executedQueryTokens.has(normalizeToken(normalizeQuery(row.query)));
                  return (
                    <tr key={i} className={`border-b sf-border-soft ${sentToSearch ? 'sf-callout sf-callout-success' : ''}`}>
                      <td className="py-1.5 px-4 font-mono sf-text-primary max-w-[24rem]">
                        {row.query}
                        {sentToSearch && (
                          <span className="ml-2 px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-success">
                            Sent to search
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-4">
                        <Chip label={row.family.replace(/_/g, ' ')} className="sf-chip-accent" />
                      </td>
                      <td className="py-1.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {row.targetFields.length > 0
                            ? row.targetFields.map((f) => <Chip key={f} label={f} className="sf-chip-success" />)
                            : <span className="sf-text-caption sf-text-subtle">&mdash;</span>
                          }
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 text-center text-xs sf-text-muted">
            No query plan data available yet.
          </div>
        )}
      </div>

      {/* Planner Context */}
      {primaryCall && (
        <div>
          <SectionHeader>planner context</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Chip label={primaryCall.status} className={llmCallStatusBadgeClass(primaryCall.status)} />
              {primaryCall.model && <span className="text-[11px] font-mono sf-text-muted">{primaryCall.model}</span>}
              {primaryCall.provider && <span className="text-[11px] font-mono sf-text-subtle">{primaryCall.provider}</span>}
            </div>
            <div className="grid grid-cols-2 gap-1 sf-text-caption">
              <span className="sf-text-muted">Model</span>
              <span className="font-mono">{primaryCall.model || '-'}</span>
              <span className="sf-text-muted">Provider</span>
              <span className="font-mono">{primaryCall.provider || '-'}</span>
              {primaryCall.tokens && (
                <>
                  <span className="sf-text-muted">Tokens</span>
                  <span className="font-mono">{primaryCall.tokens.input}+{primaryCall.tokens.output}</span>
                </>
              )}
              {primaryCall.duration_ms !== undefined && (
                <>
                  <span className="sf-text-muted">Duration</span>
                  <span className="font-mono">{formatMs(primaryCall.duration_ms)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LLM Call Details (collapsible) */}
      {calls.length > 0 && (
        <div>
          <CollapsibleSectionHeader isOpen={llmCallsOpen} onToggle={toggleLlmCallsOpen} summary={<>{calls.length} call{calls.length !== 1 ? 's' : ''}{totalTokens > 0 && <> &middot; {totalTokens.toLocaleString()} tok</>}{totalDuration > 0 && <> &middot; {formatMs(totalDuration)}</>}</>}>llm call details</CollapsibleSectionHeader>

          {llmCallsOpen && (
            <div className="mt-3 space-y-2">
              {calls.map((call, i) => (
                <LlmCallCard key={i} call={call} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
