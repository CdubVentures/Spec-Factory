// WHY: Trace lifecycle for processDiscoveryResults.
// Creates the candidate trace map (Phase 0) and enriches traces with
// reason codes after SERP selection (Phase 6).

import {
  uniqueTokens,
  countTokenHits,
  normalizeIdentityTokens,
} from '../shared/discoveryIdentity.js';
import { docHintMatchesDocKind } from '../shared/urlClassifier.js';

/**
 * Creates a candidate trace map with lazy-create + merge semantics.
 * Each URL gets one trace row; overlapping appearances merge tokens.
 *
 * @returns {{ ensureTrace: Function, candidateTraceByUrl: Map }}
 */
export function createCandidateTraceMap() {
  const candidateTraceByUrl = new Map();

  const ensureTrace = (url, seed = {}) => {
    const key = String(url || '').trim();
    if (!key) return null;
    if (!candidateTraceByUrl.has(key)) {
      candidateTraceByUrl.set(key, {
        url: key,
        original_url: String(seed.original_url || key).trim(),
        host: String(seed.host || '').trim(),
        root_domain: String(seed.root_domain || '').trim(),
        title: String(seed.title || '').trim(),
        snippet: String(seed.snippet || '').trim(),
        tier_guess: Number.isFinite(Number(seed.tier_guess)) ? Number(seed.tier_guess) : null,
        tier_name_guess: String(seed.tier_name_guess || '').trim(),
        role: String(seed.role || '').trim(),
        doc_kind_guess: String(seed.doc_kind_guess || '').trim(),
        approved_domain: Boolean(seed.approved_domain),
        providers: uniqueTokens(seed.providers || []),
        queries: uniqueTokens(seed.queries || []),
        query_hints: uniqueTokens(seed.query_hints || []),
        hint_sources: uniqueTokens(seed.hint_sources || []),
        target_fields: uniqueTokens(seed.target_fields || []),
        domain_hints: uniqueTokens(seed.domain_hints || []),
        triage_score: null,
        decision: String(seed.decision || 'pending').trim() || 'pending',
        reason_codes: uniqueTokens(seed.reason_codes || []),
      });
    }
    const row = candidateTraceByUrl.get(key);
    row.providers = uniqueTokens([...(row.providers || []), ...(seed.providers || [])]);
    row.queries = uniqueTokens([...(row.queries || []), ...(seed.queries || [])]);
    row.query_hints = uniqueTokens([...(row.query_hints || []), ...(seed.query_hints || [])]);
    row.hint_sources = uniqueTokens([...(row.hint_sources || []), ...(seed.hint_sources || [])]);
    row.target_fields = uniqueTokens([...(row.target_fields || []), ...(seed.target_fields || [])]);
    row.domain_hints = uniqueTokens([...(row.domain_hints || []), ...(seed.domain_hints || [])]);
    row.reason_codes = uniqueTokens([...(row.reason_codes || []), ...(seed.reason_codes || [])]);
    if (!row.title && seed.title) row.title = String(seed.title || '').trim();
    if (!row.snippet && seed.snippet) row.snippet = String(seed.snippet || '').trim();
    if (!row.host && seed.host) row.host = String(seed.host || '').trim();
    if (!row.root_domain && seed.root_domain) row.root_domain = String(seed.root_domain || '').trim();
    if (!row.doc_kind_guess && seed.doc_kind_guess) row.doc_kind_guess = String(seed.doc_kind_guess || '').trim();
    if (!row.role && seed.role) row.role = String(seed.role || '').trim();
    if (!row.tier_name_guess && seed.tier_name_guess) row.tier_name_guess = String(seed.tier_name_guess || '').trim();
    if (row.tier_guess === null && Number.isFinite(Number(seed.tier_guess))) {
      row.tier_guess = Number(seed.tier_guess);
    }
    if (seed.approved_domain) row.approved_domain = true;
    return row;
  };

  return { ensureTrace, candidateTraceByUrl };
}

/**
 * Enriches candidate traces with decision, tier, reason codes after SERP selection.
 * Mutates candidateTraceByUrl in-place (matching original behavior).
 *
 * @param {object} ctx
 * @param {Map} ctx.candidateTraceByUrl
 * @param {Map} ctx.candidateByUrl - canonical URL → classified candidate row
 * @param {Set} ctx.selectedUrlSet - URLs that were selected by SERP selector
 * @param {object} ctx.variables - brand/model/variant tokens
 * @param {Map} ctx.queryMetaByQuery - query text → query row metadata
 */
export function enrichCandidateTraces({
  candidateTraceByUrl,
  candidateByUrl,
  selectedUrlSet,
  variables,
  queryMetaByQuery,
}) {
  const { brandTokens, modelTokens } = normalizeIdentityTokens(variables);

  for (const trace of candidateTraceByUrl.values()) {
    const candidateRow = candidateByUrl.get(String(trace.url || '').trim());
    if (!candidateRow) {
      if (trace.decision !== 'rejected') {
        trace.decision = 'rejected';
        trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), 'triage_excluded']);
      }
      continue;
    }

    const isSelected = selectedUrlSet.has(String(trace.url || '').trim());
    trace.decision = isSelected ? 'selected' : 'not_selected';
    trace.tier_guess = Number.isFinite(Number(candidateRow.tier))
      ? Number(candidateRow.tier)
      : (Number.isFinite(Number(trace.tier_guess)) ? Number(trace.tier_guess) : null);
    trace.tier_name_guess = String(candidateRow.tierName || trace.tier_name_guess || '').trim();
    trace.approved_domain = Boolean(candidateRow.approvedDomain || trace.approved_domain);
    trace.doc_kind_guess = String(candidateRow.doc_kind_guess || trace.doc_kind_guess || '').trim();
    trace.triage_score = Number(candidateRow.score || 0);

    const haystack = `${trace.title || ''} ${trace.snippet || ''} ${trace.url || ''}`.toLowerCase();
    const reasonCodes = [...(trace.reason_codes || [])];
    if (trace.approved_domain) reasonCodes.push('approved_domain');
    if (trace.tier_guess === 1) reasonCodes.push('tier_1');
    if (trace.tier_guess === 2) reasonCodes.push('tier_2');
    if (String(trace.doc_kind_guess || '').includes('pdf')) reasonCodes.push('doc_pdf');
    if ((candidateRow.cross_provider_count || 0) > 1) reasonCodes.push('cross_provider_multi');
    if (countTokenHits(haystack, brandTokens) > 0) reasonCodes.push('brand_match');
    if (countTokenHits(haystack, modelTokens) > 0) reasonCodes.push('model_match');
    for (const query of trace.queries || []) {
      const meta = queryMetaByQuery.get(String(query || '').trim()) || {};
      if (meta?.domain_hint) {
        const hostToken = String(trace.host || '').toLowerCase();
        const hintToken = String(meta.domain_hint || '').toLowerCase().replace(/^www\./, '');
        if (hostToken && hintToken && hostToken.includes(hintToken)) {
          reasonCodes.push('domain_hint_match');
        }
      }
      if (docHintMatchesDocKind(meta?.doc_hint, trace.doc_kind_guess)) {
        reasonCodes.push('doc_hint_match');
      }
      if (String(meta?.hint_source || '').trim()) {
        reasonCodes.push(`hint:${String(meta.hint_source).trim()}`);
      }
    }
    reasonCodes.push(isSelected ? 'selected_top_k' : 'below_top_k_cutoff');
    trace.reason_codes = uniqueTokens(reasonCodes);
  }
}
