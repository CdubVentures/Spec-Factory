// WHY: Payload assembly for processDiscoveryResults.
// Phase 7: Build SERP explorer (query rows + analytics object).
// Phase 9: Assemble discovery + candidates storage payloads.

import { resolvePhaseModel } from '../../../../core/llm/client/routing.js';
import { toArray, uniqueTokens } from '../shared/discoveryIdentity.js';

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
  searchResults,
  hardDrops,
  selected,
  notSelected,
  selectorInput,
  validation,
  auditTrail,
  canonMergeCount,
  config,
  fallbackApplied = false,
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
          ? Number(trace.triage_score)
          : 0,
        decision: trace.decision || 'pending',
        reason_codes: uniqueTokens(trace.reason_codes || []),
        providers: uniqueTokens(trace.providers || []),
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
    fallback_applied: fallbackApplied,
    llm_selector_model: resolvePhaseModel(config, 'serpSelector') || String(config.llmModelPlan || '').trim(),
    query_count: serpQueryRows.length,
    candidates_checked: candidateTraceRows.length,
    urls_triaged: candidateRows.length,
    candidates_sent: selectorInput.candidates.length,
    urls_selected: selectedUrlSet.size,
    urls_rejected: candidateTraceRows.filter((row) => row.decision === 'rejected').length,
    raw_input: searchResults.length,
    hard_drop_count: hardDrops.length,
    canon_merge_count: canonMergeCount,
    soft_exclude_count: notSelected.length,
    audit_trail: auditTrail,
    queries: serpQueryRows,
  };
}

/**
 * No-op stub — discovery/candidates diagnostic dumps are no longer written.
 * Kept as a function signature for backward compat with callers.
 *
 * @returns {{}}
 */
export async function writeDiscoveryPayloads() {
  return {};
}
