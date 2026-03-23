// WHY: Stage 05 of the prefetch pipeline — Query Journey.
// Receives enhanced query rows from Search Planner + host-plan rows,
// dedupes, ranks, guards, and produces the final selected query list.

import { z } from 'zod';
import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import {
  dedupeQueryRows,
  prioritizeQueryRows,
  enforceIdentityQueryGuard,
} from '../discoveryQueryPlan.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { toArray } from '../discoveryIdentity.js';
import {
  buildSearchProfileKeys,
  writeSearchProfileArtifacts,
  resolveSearchProfileCaps,
} from '../discoveryHelpers.js';

export const queryJourneyInputSchema = z.object({
  searchProfileBase: z.object({}).passthrough(),
  enhancedRows: z.array(z.unknown()).optional().default([]),
  hostPlanQueryRows: z.array(z.unknown()).optional().default([]),
  variables: z.object({}).passthrough().optional().default({}),
  config: z.record(z.string(), z.unknown()),
  searchProfileCaps: z.object({}).passthrough().optional().default({}),
  missingFields: z.array(z.string()).optional().default([]),
  planningHints: z.object({}).passthrough().optional().default({}),
  effectiveHostPlan: z.object({}).passthrough().nullable().optional().default(null),
  categoryConfig: z.object({}).passthrough(),
  job: z.object({}).passthrough(),
  runId: z.string().optional().default(''),
  logger: z.unknown().optional().default(null),
  storage: z.unknown(),
  brandResolution: z.object({}).passthrough().nullable().optional().default(null),
}).passthrough();

export const queryJourneyOutputSchema = z.object({
  queries: z.array(z.string()),
  selectedQueryRowMap: z.unknown(),
  profileQueryRowsByQuery: z.unknown(),
  searchProfilePlanned: z.object({}).passthrough(),
  searchProfileKeys: z.object({}).passthrough(),
  executionQueryLimit: z.number(),
  queryLimit: z.number(),
  queryRejectLogCombined: z.array(z.unknown()),
}).passthrough();

/**
 * @param {object} ctx
 * @returns {{ queries, selectedQueryRowMap, profileQueryRowsByQuery, searchProfilePlanned, executionQueryLimit, queryLimit, queryRejectLogCombined }}
 */
export async function runQueryJourney({
  searchProfileBase,
  enhancedRows = [],
  hostPlanQueryRows,
  variables,
  config,
  searchProfileCaps,
  missingFields,
  planningHints,
  effectiveHostPlan,
  categoryConfig,
  job,
  runId,
  logger,
  storage,
  brandResolution,
}) {
  const profileQueryRowsByQuery = new Map(
    toArray(searchProfileBase?.query_rows).map((row) => {
      const token = String(row?.query || '').trim().toLowerCase();
      return [token, row];
    }),
  );

  // WHY: Two input streams merged into one candidate list:
  // 1. Enhanced rows from Search Planner (tier-tagged, LLM-enhanced or deterministic fallback)
  // 2. Host-plan rows (appended after guard)
  const queryCandidates = toArray(enhancedRows).map((row) => ({
    query: String(row?.query || '').trim(),
    source: String(row?.hint_source || 'enhanced').trim(),
    target_fields: toArray(row?.target_fields),
    doc_hint: String(row?.doc_hint || '').trim(),
    domain_hint: String(row?.domain_hint || '').trim(),
    hint_source: String(row?.hint_source || '').trim(),
    tier: String(row?.tier || '').trim(),
    group_key: String(row?.group_key || '').trim(),
    normalized_key: String(row?.normalized_key || '').trim(),
    original_query: row?.original_query || undefined,
  }));

  // WHY: searchProfileQueryCap is the sole controller for total search queries per run.
  const queryLimit = configInt(config, 'searchProfileQueryCap');
  const mergedQueryCap = queryLimit;
  const mergedQueries = dedupeQueryRows(queryCandidates, searchProfileCaps.dedupeQueriesCap);

  const fieldPriority = new Map();
  for (const f of toArray(planningHints.missingCriticalFields)) {
    const key = String(f || '').trim();
    if (key) fieldPriority.set(key, 'critical');
  }
  for (const f of toArray(planningHints.missingRequiredFields)) {
    const key = String(f || '').trim();
    if (key && !fieldPriority.has(key)) fieldPriority.set(key, 'required');
  }
  const hostFieldFit = new Map();
  for (const [host, entry] of categoryConfig.sourceHostMap || new Map()) {
    const policy = effectiveHostPlan?.policy_map?.[host];
    const coverage = policy?.field_coverage || entry?.fieldCoverage;
    if (!coverage) {
      const tierName = entry?.tierName || '';
      hostFieldFit.set(host, {
        heuristic: tierName === 'manufacturer' ? 0.4 : tierName === 'lab' ? 0.3 : 0.1,
      });
      continue;
    }
    hostFieldFit.set(host, {
      high: new Set(toArray(coverage.high)),
      medium: new Set(toArray(coverage.medium)),
    });
  }
  const rankedQueries = prioritizeQueryRows(mergedQueries.rows, variables, missingFields, {
    fieldPriority,
    hostFieldFit,
  });
  const rankedCappedQueries = rankedQueries.slice(0, mergedQueryCap);
  const rankedCapRejectLog = rankedQueries.slice(mergedQueryCap).map((row) => ({
    query: String(row?.query || '').trim(),
    source: toArray(row?.sources),
    reason: 'max_query_cap',
    stage: 'pre_execution_rank_cap',
    detail: `cap:${mergedQueryCap}`,
  }));
  const guardedQueries = enforceIdentityQueryGuard({
    rows: rankedCappedQueries,
    variables,
    variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms),
  });
  const guardedSelectedRows = guardedQueries.rows.map((row) => ({
    ...row,
    hint_source: String(row?.hint_source || '').trim(),
  }));

  let appendedHostPlanRows = [];
  let hostPlanRejectLog = [];
  if (hostPlanQueryRows.length > 0) {
    const guardedHostPlanRows = enforceIdentityQueryGuard({
      rows: hostPlanQueryRows,
      variables,
      variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms),
    });
    hostPlanRejectLog = guardedHostPlanRows.rejectLog;
    const seenQueries = new Set(
      guardedSelectedRows.map((row) => String(row?.query || '').trim().toLowerCase()).filter(Boolean),
    );
    appendedHostPlanRows = guardedHostPlanRows.rows.filter((row) => {
      const token = String(row?.query || '').trim().toLowerCase();
      if (!token || seenQueries.has(token)) return false;
      seenQueries.add(token);
      return true;
    });
  }

  // WHY: Tier/planner rows fill first — they carry NeedSet-driven intent.
  // Host-plan rows are supplementary and fill remaining budget only.
  const reservedTierCount = Math.min(guardedSelectedRows.length, mergedQueryCap);
  const remainingBudget = Math.max(0, mergedQueryCap - reservedTierCount);
  const selectedQueryRows = [
    ...guardedSelectedRows.slice(0, reservedTierCount),
    ...appendedHostPlanRows.slice(0, remainingBudget),
  ];
  let queries = selectedQueryRows.map((row) => String(row?.query || '').trim()).filter(Boolean);
  if (!queries.length && rankedCappedQueries.length > 0) {
    const fallback = String(rankedCappedQueries[0]?.query || '').trim();
    if (fallback) {
      queries = [fallback];
      selectedQueryRows.push({ ...rankedCappedQueries[0], query: fallback });
      guardedQueries.rejectLog.push({
        query: fallback,
        source: toArray(rankedCappedQueries[0]?.sources),
        reason: 'guard_fallback_retained',
        stage: 'pre_execution_guard',
        detail: 'all_queries_rejected',
      });
    }
  }

  const queryRejectLogCombined = [
    ...toArray(searchProfileBase?.query_reject_log),
    ...toArray(mergedQueries.rejectLog),
    ...toArray(rankedCapRejectLog),
    ...toArray(guardedQueries.rejectLog),
    ...toArray(hostPlanRejectLog),
  ].slice(0, 300);

  const executionQueryLimit = Math.min(queryLimit, queries.length);
  const selectedQueryRowMap = new Map(
    selectedQueryRows.map((row) => [String(row?.query || '').trim().toLowerCase(), row]),
  );

  const searchProfileKeys = buildSearchProfileKeys({
    storage,
    config,
    category: categoryConfig.category,
    productId: job.productId,
    runId,
  });

  // WHY: llm_queries populated from enhanced rows that were LLM-rewritten.
  const llmQueries = toArray(enhancedRows)
    .filter((row) => String(row?.hint_source || '').endsWith('_llm'))
    .map((row) => String(row?.query || '').trim())
    .filter(Boolean);

  const searchProfilePlanned = {
    ...searchProfileBase,
    category: categoryConfig.category,
    product_id: job.productId,
    run_id: runId,
    base_model: job.baseModel || '',
    aliases: job.aliases || [],
    generated_at: new Date().toISOString(),
    status: 'planned',
    provider: config.searchEngines,
    llm_queries: llmQueries,
    query_reject_log: queryRejectLogCombined,
    query_guard: {
      brand_tokens: toArray(guardedQueries.guardContext?.brandTokens),
      model_tokens: toArray(guardedQueries.guardContext?.modelTokens),
      required_digit_groups: toArray(guardedQueries.guardContext?.requiredDigitGroups),
      accepted_query_count: queries.length,
      rejected_query_count: toArray(guardedQueries.rejectLog).length + toArray(hostPlanRejectLog).length,
    },
    selected_queries: queries.slice(0, executionQueryLimit),
    selected_query_count: Math.min(executionQueryLimit, queries.length),
    query_rows: selectedQueryRows.slice(0, executionQueryLimit),
    effective_host_plan: effectiveHostPlan,
    brand_resolution: brandResolution ? {
      officialDomain: brandResolution.officialDomain || '',
      supportDomain: brandResolution.supportDomain || '',
      aliases: brandResolution.aliases || [],
      confidence: brandResolution.confidence ?? 0,
      reasoning: brandResolution.reasoning || [],
    } : null,
    key: searchProfileKeys.inputKey,
    run_key: searchProfileKeys.runKey,
    latest_key: searchProfileKeys.latestKey,
  };
  await writeSearchProfileArtifacts({
    storage,
    payload: searchProfilePlanned,
    keys: searchProfileKeys,
  });
  logger?.info?.('query_journey_completed', {
    selected_query_count: queries.length,
    selected_queries: queries.slice(0, 50),
    deterministic_query_count: toArray(enhancedRows).filter((r) => !String(r?.hint_source || '').endsWith('_llm')).length,
    llm_enhanced_count: llmQueries.length,
    schema4_query_count: llmQueries.length,
    host_plan_query_count: appendedHostPlanRows.length,
    rejected_count: queryRejectLogCombined.length,
  });

  return {
    queries,
    selectedQueryRowMap,
    profileQueryRowsByQuery,
    searchProfilePlanned,
    searchProfileKeys,
    executionQueryLimit,
    queryLimit,
    queryRejectLogCombined,
  };
}
