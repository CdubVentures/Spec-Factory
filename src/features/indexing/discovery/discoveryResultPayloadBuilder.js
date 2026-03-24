// WHY: Payload assembly for processDiscoveryResults.
// Phase 7: Build SERP explorer (query rows + analytics object).
// Phase 9: Assemble discovery + candidates storage payloads.

import { resolvePhaseModel } from '../../../core/llm/client/routing.js';
import { toPosixKey } from '../../../s3/storage.js';
import { toArray, uniqueTokens } from './discoveryIdentity.js';

/**
 * Builds the serpExplorer object: per-query trace rows + analytics metadata.
 *
 * @param {object} ctx
 * @returns {object} serpExplorer
 */
export function buildSerpExplorer({
  queryRowsEnriched,
  candidateTraceByUrl,
  candidateByUrl,
  selectedUrlSet,
  candidateRows,
  rawResults,
  hardDrops,
  selected,
  notSelected,
  selectorInput,
  validation,
  auditTrail,
  canonMergeCount,
  config,
}) {
  const tracesByQuery = new Map();
  for (const trace of candidateTraceByUrl.values()) {
    for (const query of trace.queries || []) {
      const token = String(query || '').trim();
      if (!token) continue;
      if (!tracesByQuery.has(token)) {
        tracesByQuery.set(token, []);
      }
      tracesByQuery.get(token).push(trace);
    }
  }

  const decisionRank = {
    selected: 3,
    not_selected: 2,
    rejected: 1,
    eligible: 1,
    pending: 0,
  };

  const serpQueryRows = queryRowsEnriched.map((row) => {
    const queryText = String(row?.query || '').trim();
    const traces = [...(tracesByQuery.get(queryText) || [])]
      .sort((a, b) => {
        const decisionCmp = (decisionRank[b.decision] || 0) - (decisionRank[a.decision] || 0);
        if (decisionCmp !== 0) return decisionCmp;
        const scoreCmp = Number(b.triage_score || 0) - Number(a.triage_score || 0);
        if (scoreCmp !== 0) return scoreCmp;
        return String(a.url || '').localeCompare(String(b.url || ''));
      })
      .map((trace) => ({
        url: trace.url,
        title: String(trace.title || ''),
        snippet: String(trace.snippet || ''),
        host: trace.host,
        tier: trace.tier_guess,
        tier_name: trace.tier_name_guess,
        doc_kind: trace.doc_kind_guess || 'other',
        triage_score: Number.isFinite(Number(trace.triage_score))
          ? Number(Number(trace.triage_score).toFixed(3))
          : 0,
        triage_reason: trace.triage_reason || '',
        decision: trace.decision || 'pending',
        reason_codes: uniqueTokens(trace.reason_codes || []),
        providers: uniqueTokens(trace.providers || []),
        primary_lane: candidateByUrl.get(trace.url)?.primary_lane || null,
        triage_disposition: candidateByUrl.get(trace.url)?.triage_disposition || null,
        identity_prelim: candidateByUrl.get(trace.url)?.identity_prelim || null,
        host_trust_class: candidateByUrl.get(trace.url)?.host_trust_class || null,
        score_breakdown: candidateByUrl.get(trace.url)?.score_breakdown || null,
      }));
    const selectedCount = traces.filter((item) => item.decision === 'selected').length;
    return {
      query: queryText,
      hint_source: String(row?.hint_source || '').trim(),
      target_fields: toArray(row?.target_fields),
      doc_hint: String(row?.doc_hint || '').trim(),
      domain_hint: String(row?.domain_hint || '').trim(),
      result_count: Number(row?.result_count || 0),
      attempts: Number(row?.attempts || 0),
      providers: toArray(row?.providers),
      candidate_count: traces.length,
      selected_count: selectedCount,
      candidates: traces,
    };
  });

  const candidateTraceRows = [...candidateTraceByUrl.values()];
  return {
    generated_at: new Date().toISOString(),
    provider: config.searchEngines,
    llm_selector_enabled: true,
    llm_selector_applied: validation.valid,
    llm_selector_model: resolvePhaseModel(config, 'serpSelector') || String(config.llmModelPlan || '').trim(),
    query_count: serpQueryRows.length,
    candidates_checked: candidateTraceRows.length,
    urls_triaged: candidateRows.length,
    candidates_sent: selectorInput.candidates.length,
    urls_selected: selectedUrlSet.size,
    urls_rejected: candidateTraceRows.filter((row) => row.decision === 'rejected').length,
    raw_input: rawResults.length,
    hard_drop_count: hardDrops.length,
    canon_merge_count: canonMergeCount,
    soft_exclude_count: notSelected.length,
    audit_trail: auditTrail,
    queries: serpQueryRows,
  };
}

/**
 * Assembles discovery + candidates storage payloads and writes them.
 *
 * @param {object} ctx
 * @returns {{ discoveryKey: string, candidatesKey: string }}
 */
export async function writeDiscoveryPayloads({
  config,
  storage,
  categoryConfig,
  job,
  runId,
  queries,
  llmQueries,
  missingFields,
  internalSatisfied,
  externalSearchReason,
  searchAttempts,
  searchJournal,
  providerState,
  queryConcurrency,
  searchProfileFinal,
  serpExplorer,
  candidateRowsFinal,
  discovered,
  selectedUrls,
  searchProfileKeys,
}) {
  const discoveryKey = toPosixKey(
    config.s3InputPrefix,
    '_discovery',
    categoryConfig.category,
    `${runId}.json`
  );
  const candidatesKey = toPosixKey(
    config.s3InputPrefix,
    '_sources',
    'candidates',
    categoryConfig.category,
    `${runId}.json`
  );

  const discoveryPayload = {
    category: categoryConfig.category,
    productId: job.productId,
    runId,
    generated_at: new Date().toISOString(),
    provider: config.searchEngines,
    provider_state: providerState,
    query_concurrency: queryConcurrency,
    llm_query_planning: true,
    llm_query_model: resolvePhaseModel(config, 'searchPlanner') || String(config.llmModelPlan || '').trim(),
    llm_serp_selector: true,
    llm_serp_selector_model: resolvePhaseModel(config, 'serpSelector') || String(config.llmModelPlan || '').trim(),
    query_count: queries.length,
    query_reject_count: toArray(searchProfileFinal?.query_reject_log).length,
    discovered_count: discovered.length,
    selected_count: selectedUrls.length,
    queries,
    query_guard: searchProfileFinal.query_guard || null,
    query_reject_log: toArray(searchProfileFinal.query_reject_log),
    llm_queries: llmQueries,
    search_profile_key: searchProfileKeys.inputKey,
    search_profile_run_key: searchProfileKeys.runKey,
    search_profile_latest_key: searchProfileKeys.latestKey,
    targeted_missing_fields: missingFields,
    internal_satisfied: internalSatisfied,
    external_search_reason: externalSearchReason,
    search_attempts: searchAttempts,
    search_journal: searchJournal,
    serp_explorer: serpExplorer,
    discovered: candidateRowsFinal,
  };
  const candidatePayload = {
    category: categoryConfig.category,
    productId: job.productId,
    runId,
    generated_at: new Date().toISOString(),
    candidate_count: candidateRowsFinal.length,
    approved_count: selectedUrls.length,
    candidates: candidateRowsFinal,
  };

  await storage.writeObject(
    discoveryKey,
    Buffer.from(JSON.stringify(discoveryPayload, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );
  await storage.writeObject(
    candidatesKey,
    Buffer.from(JSON.stringify(candidatePayload, null, 2), 'utf8'),
    { contentType: 'application/json' }
  );

  return { discoveryKey, candidatesKey };
}
