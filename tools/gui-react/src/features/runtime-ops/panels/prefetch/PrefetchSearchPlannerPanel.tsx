import { useMemo } from 'react';
import { usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import type { PrefetchLlmCall, SearchPlanPass, PrefetchSearchResult } from '../../types.ts';
import { formatMs } from '../../helpers.ts';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { LlmCallCard } from '../../components/LlmCallCard.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails.tsx';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { PrefetchEmptyState } from './PrefetchEmptyState.tsx';
import type { RuntimeIdxBadge } from '../../types.ts';
import {
  normalizeToken,
  normalizeQuery,
  parsePlannerPayload,
  isSchema4PlannerPath,
  isTierEnhancePath,
  buildPlannerInputSummary,
} from './searchPlannerHelpers.ts';
import { SearchPlannerSchema4View } from './SearchPlannerSchema4View.tsx';
import { SearchPlannerTierEnhanceView } from './SearchPlannerTierEnhanceView.tsx';
import { SearchPlannerPassResults } from './SearchPlannerPassResults.tsx';
import { SearchPlannerContextSection } from './SearchPlannerContextSection.tsx';

/* ── Props ──────────────────────────────────────────────────────────── */

interface PrefetchSearchPlannerPanelProps {
  calls: PrefetchLlmCall[];
  searchPlans?: SearchPlanPass[];
  searchResults?: PrefetchSearchResult[];
  liveSettings?: unknown;
  idxRuntime?: RuntimeIdxBadge[];
  persistScope?: string;
}

/* ── Main Panel ─────────────────────────────────────────────────────── */

export function PrefetchSearchPlannerPanel({
  calls,
  searchPlans,
  searchResults,
  idxRuntime,
  persistScope = '',
}: PrefetchSearchPlannerPanelProps) {
  const [expandedPassQueries, toggleExpandedPassQuery] = usePersistedExpandMap(`runtimeOps:searchPlanner:expandedPass:${persistScope}`);
  const plans = searchPlans || [];
  const executedQueryTokens = useMemo(() => new Set(
    (searchResults || []).map((result) => normalizeToken(normalizeQuery(result.query))),
  ), [searchResults]);
  const callPayloads = useMemo(() => calls.map((call) => parsePlannerPayload(call.prompt_preview)), [calls]);
  const plannerInputSummary = useMemo(() => buildPlannerInputSummary(callPayloads), [callPayloads]);

  const tierEnhanceActive = useMemo(() => isTierEnhancePath(plans), [plans]);
  const schema4Active = useMemo(() => isSchema4PlannerPath(calls), [calls]);

  const totalTokens = calls.reduce((sum, call) => sum + (call.tokens?.input ?? 0) + (call.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, call) => sum + (call.duration_ms ?? 0), 0);
  const hasFailed = calls.some((call) => call.status === 'failed');
  const hasCalls = calls.length > 0;
  const hasStructured = plans.length > 0;
  const totalQueries = plans.reduce((sum, plan) => sum + (plan.queries_generated?.length || 0), 0);
  const overallStatus = hasFailed ? 'failed' : 'finished';

  const sentToSearchTotal = useMemo(() => {
    let count = 0;
    for (const plan of plans) {
      for (const query of plan.queries_generated) {
        if (executedQueryTokens.has(normalizeToken(normalizeQuery(query)))) count += 1;
      }
    }
    return count;
  }, [plans, executedQueryTokens]);

  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:searchPlanner:llmCallsLegacy:${persistScope}`, false);
  const [contextOpen, toggleContextOpen] = usePersistedToggle(`runtimeOps:searchPlanner:contextLegacy:${persistScope}`, true);

  /* Delegate to specialized views when applicable */
  if (tierEnhanceActive) {
    return <SearchPlannerTierEnhanceView calls={calls} searchPlans={searchPlans} searchResults={searchResults} idxRuntime={idxRuntime} persistScope={persistScope} />;
  }

  if (schema4Active) {
    return <SearchPlannerSchema4View calls={calls} searchPlans={searchPlans} searchResults={searchResults} idxRuntime={idxRuntime} persistScope={persistScope} />;
  }

  if (!hasCalls && !hasStructured) {
    return (
      <div className="flex flex-col gap-5 p-5 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Search Planner</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <PrefetchEmptyState
          icon="&#128506;"
          heading="Waiting for search plan"
          description="Search plans will appear after the planner generates targeted queries to close field coverage gaps identified by the NeedSet."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* Hero Band */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Search Planner</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Query Generation</span>
          <Chip label={overallStatus.toUpperCase()} className={overallStatus === 'finished' ? 'sf-chip-success' : 'sf-chip-danger'} />
        </>}
        trailing={<>
          <Chip label="LLM" className="sf-chip-warning" />
          <Tip text="The Search Planner LLM generates targeted queries in multiple passes (Primary, Fast, Reason, Validate) to close missing field coverage gaps identified by the NeedSet." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={totalQueries} label="queries generated" />
          <HeroStat value={plans.length} label="passes" />
          <HeroStat value={sentToSearchTotal} label="sent to search" colorClass={sentToSearchTotal > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={calls.length} label="llm calls" colorClass="sf-text-primary" />
        </HeroStatGrid>

        {/* Narrative */}
        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          Planner generated <strong className="sf-text-primary not-italic">{totalQueries}</strong> targeted
          {' '}queries across <strong className="sf-text-primary not-italic">{plans.length}</strong> pass{plans.length !== 1 ? 'es' : ''}
          {sentToSearchTotal > 0 && (
            <> &mdash; <strong className="sf-text-primary not-italic">{sentToSearchTotal}</strong> sent to search</>
          )}
          {plannerInputSummary.missingCriticalFields.length > 0 && (
            <>, targeting <strong className="sf-text-primary not-italic">{plannerInputSummary.missingCriticalFields.length}</strong> missing critical field{plannerInputSummary.missingCriticalFields.length !== 1 ? 's' : ''}</>
          )}
          {totalTokens > 0 && (
            <>. Used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>
          )}
          .
        </div>
      </HeroBand>

      {/* Planner Context */}
      <SearchPlannerContextSection
        plannerInputSummary={plannerInputSummary}
        contextOpen={contextOpen}
        toggleContextOpen={toggleContextOpen}
      />

      {/* Pass Results */}
      {hasStructured && (
        <SearchPlannerPassResults
          plans={plans}
          totalQueries={totalQueries}
          executedQueryTokens={executedQueryTokens}
          expandedPassQueries={expandedPassQueries}
          toggleExpandedPassQuery={toggleExpandedPassQuery}
        />
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

      {/* Debug */}
      {hasStructured && (
        <DebugJsonDetails label="raw search planner json" data={{ calls: calls.length, plans, plannerInputSummary }} />
      )}
    </div>
  );
}
