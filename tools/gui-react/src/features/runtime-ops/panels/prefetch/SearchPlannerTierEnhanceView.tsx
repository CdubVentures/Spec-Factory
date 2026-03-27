import { useMemo } from 'react';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { PrefetchLlmCall, SearchPlanPass, SearchPlanEnhancementRow, PrefetchSearchResult } from '../../types.ts';
import type { RuntimeIdxBadge } from '../../types.ts';
import { formatMs } from '../../helpers.ts';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { LlmCallCard } from '../../components/LlmCallCard.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails.tsx';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { classifyQueryTier, tierLabel as tierLabelSsot, tierChipClass } from '../../selectors/searchProfileTierHelpers.js';
import { normalizeToken, normalizeQuery } from './searchPlannerHelpers.ts';

/* ── Props ──────────────────────────────────────────────────────────── */

export interface SearchPlannerTierEnhanceViewProps {
  calls: PrefetchLlmCall[];
  searchPlans?: SearchPlanPass[];
  searchResults?: PrefetchSearchResult[];
  idxRuntime?: RuntimeIdxBadge[];
  persistScope?: string;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function SearchPlannerTierEnhanceView({
  calls,
  searchPlans,
  searchResults,
  idxRuntime,
  persistScope = '',
}: SearchPlannerTierEnhanceViewProps) {
  const scrollRef = usePersistedScroll(`scroll:searchPlannerTierEnhance:${persistScope}`);
  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:searchPlanner:llmCallsTier:${persistScope}`, false);
  const plans = searchPlans || [];

  const enhancePlan = plans.find((p) => p.mode === 'tier_enhance');
  const rows: SearchPlanEnhancementRow[] = enhancePlan?.enhancement_rows || [];
  const source = enhancePlan?.source || 'deterministic_fallback';
  const isLlm = source === 'llm';
  const totalRows = rows.length;
  const enhancedCount = rows.filter((r) => r.hint_source.endsWith('_llm')).length;
  const deterministicCount = totalRows - enhancedCount;

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const t = row.tier || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [rows]);

  const executedQueryTokens = useMemo(() => new Set(
    (searchResults || []).map((r) => normalizeToken(normalizeQuery(r.query))),
  ), [searchResults]);

  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);

  return (
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* Hero Band */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Search Planner</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Query Enhancement</span>
          <Chip
            label={isLlm ? 'LLM ENHANCED' : 'DETERMINISTIC'}
            className={isLlm ? 'sf-chip-success' : 'sf-chip-neutral'}
          />
        </>}
        trailing={<>
          <Chip label="Search Planner" className="sf-chip-info" />
          {isLlm && <Chip label="LLM" className="sf-chip-warning" />}
          <Tip text="The Search Planner takes deterministic queries from Search Profile and optionally enhances them via LLM. Each row shows the original query and the enhanced version." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={totalRows} label="total queries" />
          <HeroStat value={enhancedCount} label="LLM enhanced" colorClass={enhancedCount > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={deterministicCount} label="unchanged" />
          <HeroStat value={calls.length} label="llm calls" colorClass="sf-text-primary" />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          {isLlm ? (
            <>LLM enhanced <strong className="sf-text-primary not-italic">{enhancedCount}</strong> of <strong className="sf-text-primary not-italic">{totalRows}</strong> queries{totalTokens > 0 && <> &mdash; used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>}.</>
          ) : (
            <>Deterministic fallback &mdash; all <strong className="sf-text-primary not-italic">{totalRows}</strong> queries passed through unchanged (no LLM API key or model configured).</>
          )}
          {Object.keys(tierCounts).length > 0 && (
            <> Tier breakdown: {Object.entries(tierCounts).map(([t, c], i) => (
              <span key={t}>{i > 0 && ', '}<strong className="sf-text-primary not-italic">{c}</strong> {tierLabelSsot(classifyQueryTier({ query: '', tier: t })).toLowerCase()}</span>
            ))}.
            </>
          )}
        </div>
      </HeroBand>

      {/* Rationale */}
      {enhancePlan?.plan_rationale && (
        <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-3 text-xs sf-text-muted italic">
          {enhancePlan.plan_rationale}
        </div>
      )}

      {/* Before / After Enhancement Table */}
      <div>
        <SectionHeader>query enhancement{isLlm ? ' comparison' : ''} &middot; {totalRows} queries</SectionHeader>
        {rows.length > 0 ? (
          <div className="overflow-x-auto overflow-y-auto max-h-[56rem] border sf-border-soft rounded-sm">
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  {['#', 'tier', 'deterministic query', 'enhanced query', 'target fields'].map((h) => (
                    <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const wasEnhanced = row.hint_source.endsWith('_llm');
                  const queryChanged = wasEnhanced && row.original_query !== row.query;
                  const sentToSearch = executedQueryTokens.has(normalizeToken(normalizeQuery(row.query)));
                  return (
                    <tr key={i} className={`border-b sf-border-soft ${sentToSearch ? 'sf-callout sf-callout-success' : ''}`}>
                      <td className="py-1.5 px-4 font-mono sf-text-subtle w-8">{i + 1}</td>
                      <td className="py-1.5 px-4">
                        <Chip label={tierLabelSsot(classifyQueryTier({ query: '', tier: row.tier }))} className={tierChipClass(classifyQueryTier({ query: '', tier: row.tier }))} />
                      </td>
                      <td className="py-1.5 px-4 font-mono sf-text-muted max-w-[22rem]">
                        {row.original_query || row.query}
                      </td>
                      <td className="py-1.5 px-4 font-mono max-w-[22rem]">
                        {queryChanged ? (
                          <span className="text-[var(--sf-state-success-fg)] font-medium">
                            {row.query}
                          </span>
                        ) : (
                          <span className="sf-text-subtle">
                            <Chip label="unchanged" className="sf-chip-neutral" />
                          </span>
                        )}
                        {sentToSearch && (
                          <span className="ml-2 px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-success">
                            Sent to search
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {row.target_fields.length > 0
                            ? row.target_fields.map((f) => <Chip key={f} label={f} className="sf-chip-success" />)
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
            No enhancement data available.
          </div>
        )}
      </div>

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

      {/* Debug */}
      <DebugJsonDetails label="raw search planner json" data={{ source, calls: calls.length, plans, enhancementRows: rows }} />
    </div>
  );
}
