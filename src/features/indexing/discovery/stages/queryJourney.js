// WHY: Stage 05 of the prefetch pipeline — Query Journey.
// Merges ALL query streams (base, targeted, schema4, uber, host-plan),
// dedupes, ranks, guards, and produces the final selected query list.

import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import {
  dedupeQueryRows,
  prioritizeQueryRows,
  enforceIdentityQueryGuard,
} from '../discoveryQueryPlan.js';
import { toArray } from '../discoveryIdentity.js';
import {
  buildSearchProfileKeys,
  writeSearchProfileArtifacts,
  resolveSearchProfileCaps,
} from '../discoveryHelpers.js';

/**
 * @param {object} ctx
 * @returns {{ queries, selectedQueryRowMap, profileQueryRowsByQuery, searchProfilePlanned, executionQueryLimit, queryLimit, queryRejectLogCombined }}
 */
export async function runQueryJourney({
  searchProfileBase,
  schema4Plan,
  uberSearchPlan,
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
  searchPlanHandoff,
}) {
  const baseQueries = toArray(searchProfileBase?.base_templates);
  const targetedQueries = toArray(searchProfileBase?.queries);
  const profileQueryRowsByQuery = new Map(
    toArray(searchProfileBase?.query_rows).map((row) => {
      const token = String(row?.query || '').trim().toLowerCase();
      return [token, row];
    }),
  );
  const resolveProfileQueryRow = (query) =>
    profileQueryRowsByQuery.get(String(query || '').trim().toLowerCase()) || null;

  // WHY: Four input streams merged into one candidate list:
  // 1. Deterministic base + targeted queries (from search profile)
  // 2. Schema 4 needset planner queries (from orchestrator LLM call)
  // 3. Search Planner uber queries (from planUberQueries LLM call)
  // 4. Host-plan rows (appended after guard)
  const queryCandidates = [
    ...baseQueries.map((query) => ({ query, source: 'base_template', target_fields: [] })),
    ...targetedQueries.map((query) => {
      const profileRow = resolveProfileQueryRow(query);
      return {
        query,
        source: 'targeted',
        target_fields: toArray(profileRow?.target_fields),
        doc_hint: String(profileRow?.doc_hint || '').trim(),
        domain_hint: String(profileRow?.domain_hint || '').trim(),
        hint_source: String(profileRow?.hint_source || '').trim(),
      };
    }),
    ...toArray(schema4Plan?.queryRows).map((row) => ({
      query: row.query,
      source: 'schema4',
      target_fields: toArray(row.target_fields),
      doc_hint: String(row.doc_hint || '').trim(),
      domain_hint: String(row.domain_hint || '').trim(),
      hint_source: String(row.hint_source || 'schema4_planner').trim(),
    })),
    ...toArray(uberSearchPlan?.queries).map((query) => ({
      query, source: 'uber', target_fields: [],
    })),
  ];

  const queryLimit = Math.max(1, Number(config.discoveryMaxQueries || 8));
  const mergedQueryCap = Math.max(queryLimit, 6);
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

  const selectedQueryRows = [...guardedSelectedRows, ...appendedHostPlanRows];
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
    ...toArray(schema4Plan?.rejectLog),
    ...toArray(mergedQueries.rejectLog),
    ...toArray(rankedCapRejectLog),
    ...toArray(guardedQueries.rejectLog),
    ...toArray(hostPlanRejectLog),
  ].slice(0, 300);

  const executionQueryLimit = Math.max(queryLimit, queries.length);
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
    llm_queries: [...toArray(schema4Plan?.queries), ...toArray(uberSearchPlan?.queries)],
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
    schema4_planner: searchPlanHandoff ? {
      mode: searchPlanHandoff._planner?.mode || 'unknown',
      planner_confidence: searchPlanHandoff._planner?.planner_confidence ?? 0,
      duplicates_suppressed: searchPlanHandoff._planner?.duplicates_suppressed ?? 0,
      targeted_exceptions: searchPlanHandoff._planner?.targeted_exceptions ?? 0,
    } : null,
    schema4_learning: searchPlanHandoff?._learning || null,
    schema4_panel: searchPlanHandoff?._panel || null,
    key: searchProfileKeys.inputKey,
    run_key: searchProfileKeys.runKey,
    latest_key: searchProfileKeys.latestKey,
  };
  await writeSearchProfileArtifacts({
    storage,
    payload: searchProfilePlanned,
    keys: searchProfileKeys,
  });
  logger?.info?.('search_profile_generated', {
    run_id: runId,
    category: categoryConfig.category,
    product_id: job.productId,
    alias_count: toArray(searchProfileBase?.identity_aliases).length,
    query_count: queries.length,
    key: searchProfileKeys.inputKey,
    source: schema4Plan ? 'merged_planner' : 'deterministic',
    effective_host_plan: searchProfilePlanned?.effective_host_plan || null,
    query_rows: toArray(searchProfilePlanned?.query_rows)
      .slice(0, 220)
      .map((queryRow) => ({
        query: String(queryRow?.query || '').trim(),
        hint_source: String(queryRow?.hint_source || '').trim(),
        target_fields: Array.isArray(queryRow?.target_fields) ? queryRow.target_fields : [],
        doc_hint: String(queryRow?.doc_hint || '').trim(),
        domain_hint: String(queryRow?.domain_hint || '').trim(),
        source_host: String(queryRow?.source_host || '').trim(),
        attempts: Number.parseInt(String(queryRow?.attempts || 0), 10) || 0,
        result_count: Number.parseInt(String(queryRow?.result_count || 0), 10) || 0,
        providers: Array.isArray(queryRow?.providers) ? queryRow.providers : [],
        score: Number.isFinite(Number(queryRow?.score)) ? Number(queryRow.score) : 0,
        score_breakdown: queryRow?.score_breakdown && typeof queryRow.score_breakdown === 'object'
          ? queryRow.score_breakdown
          : null,
        warnings: Array.isArray(queryRow?.warnings) ? queryRow.warnings : [],
      })),
  });

  // WHY: Emit query_journey_completed so the runtime bridge knows when to
  // advance the phase cursor and the GUI can gate search worker bouncy balls.
  logger?.info?.('query_journey_completed', {
    selected_query_count: queries.length,
    selected_queries: queries.slice(0, 50),
    schema4_query_count: toArray(schema4Plan?.queries).length,
    deterministic_query_count: baseQueries.length + targetedQueries.length,
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
