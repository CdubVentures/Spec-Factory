// WHY: Query Journey phase of the prefetch pipeline.
// Receives enhanced query rows from Search Planner,
// dedupes, ranks, guards, and produces the final selected query list.

import {
  dedupeQueryRows,
  enforceIdentityQueryGuard,
} from '../shared/queryPlan.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { toArray } from '../shared/discoveryIdentity.js';

/**
 * @param {object} ctx
 * @returns {{ queries, selectedQueryRowMap, profileQueryRowsByQuery, searchProfilePlanned, executionQueryLimit, queryLimit, queryRejectLogCombined }}
 */
export async function runQueryJourney({
  searchProfileBase,
  enhancedRows = [],
  variables,
  config,
  missingFields,
  planningHints,
  categoryConfig,
  job,
  runId,
  logger,
  storage,
  brandResolution,
  queryExecutionHistory = null,
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
    // WHY: source_host identifies which authority site a seed query targets.
    // deriveSeedStatus uses it (via provider → source_name) to track per-source cooldowns.
    source_host: String(row?.source_host || '').trim(),
    original_query: row?.original_query || undefined,
  }));

  // WHY: searchProfileQueryCap is the sole controller for total search queries per run.
  const queryLimit = configInt(config, 'searchProfileQueryCap');
  const mergedQueries = dedupeQueryRows(queryCandidates, undefined, config);

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
  let selectedQueryRows = guardedQueries.rows.map((row) => ({
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

  // WHY: Cooldown read-gate (bug B10 fix). queryCooldownDays > 0 means the user
  // wants same-query re-execution blocked within the window. We filter queries
  // whose cooldown_until is still in the future. Starvation protection: if the
  // filter would empty the queue entirely, keep all queries and log the event
  // so the run doesn't break — otherwise the very first cooldown session would
  // block every seed query and the pipeline would starve.
  const cooldownDays = configInt(config, 'queryCooldownDays');
  const cooldownRejects = [];
  let cooldownGateStarved = false;
  if (cooldownDays > 0 && queries.length > 0) {
    const nowMs = Date.now();
    const cooledSet = new Set();
    for (const qc of toArray(queryExecutionHistory?.queries)) {
      const untilMs = new Date(String(qc?.cooldown_until || '')).getTime();
      if (Number.isFinite(untilMs) && untilMs > nowMs) {
        cooledSet.add(String(qc?.query_text || '').trim().toLowerCase());
      }
    }
    if (cooledSet.size > 0) {
      const keptRows = [];
      for (const row of selectedQueryRows) {
        const q = String(row?.query || '').trim();
        if (cooledSet.has(q.toLowerCase())) {
          cooldownRejects.push({
            query: q,
            source: toArray(row?.sources),
            reason: 'cooldown_active',
            stage: 'pre_execution_cooldown',
            detail: `cooldownDays:${cooldownDays}`,
          });
        } else {
          keptRows.push(row);
        }
      }
      if (keptRows.length === 0) {
        // Starvation: don't break the run. Keep all queries, discard rejects, flag event.
        // WHY: The event itself is dropped by the bridge whitelist — the observable
        // signal is cooldown_gate_starved carried on query_journey_completed below.
        cooldownGateStarved = true;
        cooldownRejects.length = 0;
      } else {
        selectedQueryRows = keptRows;
        queries = selectedQueryRows.map((row) => String(row?.query || '').trim()).filter(Boolean);
      }
    }
  }

  const queryRejectLogCombined = [
    ...toArray(searchProfileBase?.query_reject_log),
    ...toArray(mergedQueries.rejectLog),
    ...toArray(capRejectLog),
    ...toArray(guardedQueries.rejectLog),
    ...cooldownRejects,
  ];

  const executionQueryLimit = Math.min(queryLimit, queries.length);
  const selectedQueryRowMap = new Map(
    selectedQueryRows.map((row) => [String(row?.query || '').trim().toLowerCase(), row]),
  );

  // WHY: llm_queries populated from enhanced rows that were LLM-rewritten.
  const llmQueries = toArray(enhancedRows)
    .filter((row) => String(row?.hint_source || '').endsWith('_llm'))
    .map((row) => String(row?.query || '').trim())
    .filter(Boolean);

  const searchProfilePlanned = {
    ...searchProfileBase,
    // WHY: Preserve the deterministic Search Profile output so the GUI panel
    // shows what the profile phase actually produced, not the LLM-enhanced version.
    deterministic_query_rows: toArray(searchProfileBase?.query_rows),
    category: categoryConfig.category,
    product_id: job.productId,
    run_id: runId,
    base_model: job.base_model || job?.identityLock?.base_model || job.baseModel || '',
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
    selected_queries: queries,
    selected_query_count: Math.min(executionQueryLimit, queries.length),
    query_rows: selectedQueryRows,
    brand_resolution: brandResolution ? {
      officialDomain: brandResolution.officialDomain || '',
      supportDomain: brandResolution.supportDomain || '',
      aliases: brandResolution.aliases || [],
      confidence: brandResolution.confidence ?? null,
      reasoning: brandResolution.reasoning || [],
    } : null,
  };
  logger?.info?.('query_journey_completed', {
    selected_query_count: queries.length,
    selected_queries: queries,
    deterministic_query_count: toArray(enhancedRows).filter((r) => !String(r?.hint_source || '').endsWith('_llm')).length,
    llm_enhanced_count: llmQueries.length,
    search_plan_query_count: llmQueries.length,
    rejected_count: queryRejectLogCombined.length,
    // WHY: Cooldown gate (B10) visibility. cooldown_rejected_count is the number
    // of queries that were skipped because their cooldown_until was still in the
    // future. cooldown_gate_starved=true means ALL queries matched cooldowns and
    // we kept them anyway (starvation protection — otherwise the run would break).
    cooldown_rejected_count: cooldownRejects.length,
    cooldown_gate_starved: cooldownGateStarved,
  });

  return {
    queries,
    selectedQueryRowMap,
    profileQueryRowsByQuery,
    searchProfilePlanned,
    executionQueryLimit,
    queryLimit,
    queryRejectLogCombined,
  };
}
