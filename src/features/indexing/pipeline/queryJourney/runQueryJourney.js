// WHY: Query Journey phase of the prefetch pipeline.
// Receives enhanced query rows from Search Planner,
// dedupes, ranks, guards, and produces the final selected query list.

import {
  dedupeQueryRows,
  enforceIdentityQueryGuard,
} from '../shared/queryPlan.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { toArray } from '../shared/discoveryIdentity.js';
import {
  buildSearchProfileKeys,
  writeSearchProfileArtifacts,
} from '../shared/helpers.js';

/**
 * @param {object} ctx
 * @returns {{ queries, selectedQueryRowMap, profileQueryRowsByQuery, searchProfilePlanned, executionQueryLimit, queryLimit, queryRejectLogCombined }}
 */
export async function runQueryJourney({
  searchProfileBase,
  enhancedRows = [],
  variables,
  config,
  searchProfileCaps,
  missingFields,
  planningHints,
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
  const mergedQueries = dedupeQueryRows(queryCandidates, searchProfileCaps.dedupeQueriesCap);

  // WHY: Tier order from Search Profile IS the execution priority.
  // No re-ranking — seeds first, groups by productivity, keys by availability/difficulty.
  const cappedQueries = mergedQueries.rows.slice(0, queryLimit);
  const capRejectLog = mergedQueries.rows.slice(queryLimit).map((row) => ({
    query: String(row?.query || '').trim(),
    source: toArray(row?.sources),
    reason: 'max_query_cap',
    stage: 'pre_execution_cap',
    detail: `cap:${queryLimit}`,
  }));
  const guardedQueries = enforceIdentityQueryGuard({
    rows: cappedQueries,
    variables,
    variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms),
  });
  const selectedQueryRows = guardedQueries.rows.map((row) => ({
    ...row,
    hint_source: String(row?.hint_source || '').trim(),
  }));

  let queries = selectedQueryRows.map((row) => String(row?.query || '').trim()).filter(Boolean);
  if (!queries.length && cappedQueries.length > 0) {
    const fallback = String(cappedQueries[0]?.query || '').trim();
    if (fallback) {
      queries = [fallback];
      selectedQueryRows.push({ ...cappedQueries[0], query: fallback });
      guardedQueries.rejectLog.push({
        query: fallback,
        source: toArray(cappedQueries[0]?.sources),
        reason: 'guard_fallback_retained',
        stage: 'pre_execution_guard',
        detail: 'all_queries_rejected',
      });
    }
  }

  const queryRejectLogCombined = [
    ...toArray(searchProfileBase?.query_reject_log),
    ...toArray(mergedQueries.rejectLog),
    ...toArray(capRejectLog),
    ...toArray(guardedQueries.rejectLog),
  ];

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
      rejected_query_count: toArray(guardedQueries.rejectLog).length,
    },
    selected_queries: queries.slice(0, executionQueryLimit),
    selected_query_count: Math.min(executionQueryLimit, queries.length),
    query_rows: selectedQueryRows.slice(0, executionQueryLimit),
    brand_resolution: brandResolution ? {
      officialDomain: brandResolution.officialDomain || '',
      supportDomain: brandResolution.supportDomain || '',
      aliases: brandResolution.aliases || [],
      confidence: brandResolution.confidence ?? null,
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
    selected_queries: queries,
    deterministic_query_count: toArray(enhancedRows).filter((r) => !String(r?.hint_source || '').endsWith('_llm')).length,
    llm_enhanced_count: llmQueries.length,
    search_plan_query_count: llmQueries.length,
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
