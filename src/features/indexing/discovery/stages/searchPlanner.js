// WHY: Stage 04 of the prefetch pipeline — Search Planner (LLM enrichment).
// Resolves Schema 4 handoff into execution plan and calls planUberQueries.

import { planUberQueries } from '../../../../research/queryPlanner.js';
import { resolveSchema4ExecutionPlan } from '../searchDiscovery.js';
import { toArray } from '../discoveryIdentity.js';
import { configInt } from '../../../../shared/settingsAccessor.js';

/**
 * @param {object} ctx
 * @returns {{ schema4Plan: object|null, uberSearchPlan: object|null }}
 */
export async function runSearchPlanner({
  searchPlanHandoff,
  searchProfileBase,
  variables,
  config,
  logger,
  llmContext,
  identityLock,
  missingFields,
  planningHints,
  baseQueries,
  frontierDb,
  job,
}) {
  const schema4Plan = resolveSchema4ExecutionPlan({
    searchPlanHandoff,
    variables,
    logger,
  });
  if (schema4Plan && schema4Plan.queries.length > 0) {
    logger?.info?.('schema4_path_active', {
      total_handoff: searchPlanHandoff?.queries?.length ?? 0,
      post_guard: schema4Plan.queries.length,
      rejected: schema4Plan.rejectLog.length,
    });
  }

  const targetedQueries = toArray(searchProfileBase?.queries);
  const archetypeSummary = searchProfileBase?.archetype_summary || {};
  const coverageAnalysis = searchProfileBase?.coverage_analysis || {};
  const archetypeContext = {
    archetypes_emitted: Object.keys(archetypeSummary),
    hosts_targeted: Object.values(archetypeSummary).flatMap((a) => a?.hosts || []),
    uncovered_search_worthy: coverageAnalysis.uncovered_search_worthy || [],
    representative_gaps: (coverageAnalysis.uncovered_search_worthy || []).slice(0, 10),
  };
  const enrichedLlmContext = { ...llmContext, archetypeContext };
  const frontierSummary = frontierDb?.snapshotForProduct?.(job?.productId || '') || {};
  const uberSearchPlan = await planUberQueries({
    config,
    logger,
    llmContext: enrichedLlmContext,
    identity: identityLock,
    missingFields,
    missingCriticalFields: planningHints.missingCriticalFields || [],
    baseQueries: [...baseQueries, ...targetedQueries],
    frontierSummary,
    cap: Math.max(1, configInt(config, 'searchPlannerQueryCap')),
  });

  if (toArray(uberSearchPlan?.queries).length > 0) {
    logger?.info?.('search_plan_generated', {
      pass_index: 0,
      pass_name: 'primary',
      queries_generated: toArray(uberSearchPlan.queries),
      stop_condition: 'planner_complete',
      plan_rationale: `LLM planner generated ${toArray(uberSearchPlan.queries).length} queries`,
      query_target_map: {},
      missing_critical_fields: toArray(planningHints.missingCriticalFields).slice(0, 30),
      mode: String(llmContext?.mode || 'standard'),
    });
  }

  return { schema4Plan, uberSearchPlan };
}
