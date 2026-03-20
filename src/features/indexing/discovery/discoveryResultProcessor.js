// Post-execution result processing extracted from searchDiscovery.js.
// Takes raw search results and produces the final discovery output:
// SERP dedup → hard-drop filter → LLM SERP selector → reject audit →
// trace enrichment → artifact writing → return value.

import { resolvePhaseModel } from '../../../core/llm/client/routing.js';
import { toPosixKey } from '../../../s3/storage.js';
import {
  inferRoleForHost,
  isApprovedHost,
  isDeniedHost,
  resolveTierForHost,
} from '../../../categories/loader.js';
import { dedupeSerpResults } from '../search/serpDedupe.js';
import {
  normalizeHost,
  toArray,
  uniqueTokens,
  countTokenHits,
  normalizeIdentityTokens,
} from './discoveryIdentity.js';
import {
  classifyUrlCandidate,
  docHintMatchesDocKind,
  collectDomainClassificationSeeds,
} from './discoveryUrlClassifier.js';
import {
  buildQueryAttemptStats,
  writeSearchProfileArtifacts,
} from './discoveryHelpers.js';
import { applyHardDropFilter } from './triageHardDropFilter.js';
import { sampleRejectAudit, buildAuditTrail } from './triageRejectAuditor.js';
import { buildSerpSelectorInput, validateSelectorOutput, adaptSerpSelectorOutput } from './serpSelector.js';
import { createSerpSelectorCallLlm } from './serpSelectorLlmAdapter.js';
import { callLlmWithRouting } from '../../../core/llm/client/routing.js';

export async function processDiscoveryResults({
  // From executeSearchQueries return
  rawResults, searchAttempts, searchJournal, internalSatisfied, externalSearchReason,
  // Core services
  config, storage, categoryConfig, job, runId, logger, runtimeTraceWriter, frontierDb,
  // Identity & learning
  variables, identityLock, brandResolution, missingFields, learning,
  // LLM & planning
  llmContext, searchProfileBase, llmQueries, uberSearchPlan, uberMode,
  // Search profile & query state
  queries, searchProfilePlanned, searchProfileKeys, providerState, queryConcurrency, discoveryCap,
  // Host plan
  effectiveHostPlan,
  // NeedSet pressure signals for lane-quota selection
  focusGroups = [],
  // DI seam for SERP selector (testing)
  _serpSelectorCallFn,
}) {
  const { deduped: dedupedResults, stats: dedupeStats } = dedupeSerpResults(rawResults);
  logger?.info?.('discovery_serp_deduped', {
    total_input: dedupeStats.total_input,
    total_output: dedupeStats.total_output,
    duplicates_removed: dedupeStats.duplicates_removed,
    providers_seen: dedupeStats.providers_seen
  });

  const byUrl = new Map();
  const queryMetaByQuery = new Map(
    toArray(searchProfilePlanned?.query_rows).map((row) => [String(row?.query || '').trim(), row || {}])
  );
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
        providers: uniqueTokens(seed.providers || [], 8),
        queries: uniqueTokens(seed.queries || [], 20),
        query_hints: uniqueTokens(seed.query_hints || [], 12),
        hint_sources: uniqueTokens(seed.hint_sources || [], 8),
        target_fields: uniqueTokens(seed.target_fields || [], 20),
        domain_hints: uniqueTokens(seed.domain_hints || [], 10),
        triage_score: null,
        triage_reason: '',
        decision: String(seed.decision || 'pending').trim() || 'pending',
        reason_codes: uniqueTokens(seed.reason_codes || [], 16)
      });
    }
    const row = candidateTraceByUrl.get(key);
    row.providers = uniqueTokens([...(row.providers || []), ...(seed.providers || [])], 8);
    row.queries = uniqueTokens([...(row.queries || []), ...(seed.queries || [])], 20);
    row.query_hints = uniqueTokens([...(row.query_hints || []), ...(seed.query_hints || [])], 12);
    row.hint_sources = uniqueTokens([...(row.hint_sources || []), ...(seed.hint_sources || [])], 8);
    row.target_fields = uniqueTokens([...(row.target_fields || []), ...(seed.target_fields || [])], 20);
    row.domain_hints = uniqueTokens([...(row.domain_hints || []), ...(seed.domain_hints || [])], 10);
    row.reason_codes = uniqueTokens([...(row.reason_codes || []), ...(seed.reason_codes || [])], 16);
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

  // ── Phase 2: Hard-drop filter (replaces inline non-HTTPS/denied/cooldown checks) ──
  const { survivors: hardDropSurvivors, hardDrops } = applyHardDropFilter({
    dedupedResults,
    categoryConfig,
    frontierDb,
    identityLock,
  });

  // Populate traces for hard-dropped URLs
  for (const drop of hardDrops) {
    ensureTrace(drop.url || drop.original_url, {
      host: drop.host || '',
      decision: 'rejected',
      reason_codes: [drop.hard_drop_reason],
    });
  }

  // Build candidate rows from survivors (classify + trace, no semantic kills)
  for (const raw of hardDropSurvivors) {
    try {
      const parsed = new URL(raw.url);
      const canonicalFromFrontier = frontierDb?.canonicalize?.(parsed.toString())?.canonical_url || parsed.toString();
      const queryList = uniqueTokens(
        [...toArray(raw.seen_in_queries), raw.query],
        20
      );
      const providerList = uniqueTokens(
        [...toArray(raw.seen_by_providers), raw.provider],
        8
      );
      const queryHintList = uniqueTokens(
        queryList.map((query) => String(queryMetaByQuery.get(query)?.doc_hint || '').trim()).filter(Boolean),
        12
      );
      const hintSourceList = uniqueTokens(
        queryList.map((query) => String(queryMetaByQuery.get(query)?.hint_source || '').trim()).filter(Boolean),
        8
      );
      const targetFieldList = uniqueTokens(
        queryList.flatMap((query) => toArray(queryMetaByQuery.get(query)?.target_fields)),
        20
      );
      const domainHintList = uniqueTokens(
        queryList.map((query) => String(queryMetaByQuery.get(query)?.domain_hint || '').trim()).filter(Boolean),
        10
      );
      const trace = ensureTrace(canonicalFromFrontier, {
        original_url: parsed.toString(),
        title: String(raw.title || '').trim(),
        snippet: String(raw.snippet || '').trim(),
        providers: providerList,
        queries: queryList,
        query_hints: queryHintList,
        hint_sources: hintSourceList,
        target_fields: targetFieldList,
        domain_hints: domainHintList
      });
      const classified = classifyUrlCandidate(raw, categoryConfig, {
        identityLock,
        variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms)
      });
      // WHY: No semantic kills here. Manufacturer brand mismatch, low relevance,
      // forum subdomain, sibling model — all become soft labels via assignSoftLabels.
      const canonical = canonicalFromFrontier;
      if (trace) {
        trace.host = classified.host;
        trace.root_domain = classified.rootDomain;
        trace.tier_guess = Number.isFinite(Number(classified.tier)) ? Number(classified.tier) : null;
        trace.tier_name_guess = String(classified.tierName || '').trim();
        trace.role = String(classified.role || '').trim();
        trace.doc_kind_guess = String(classified.doc_kind_guess || '').trim();
        trace.approved_domain = Boolean(classified.approvedDomain);
        trace.decision = 'eligible';
      }
      if (!byUrl.has(canonical)) {
        byUrl.set(canonical, {
          ...classified,
          url: canonical,
          original_url: parsed.toString(),
          seen_by_providers: providerList,
          seen_in_queries: queryList,
          cross_provider_count: providerList.length
        });
      } else {
        const existing = byUrl.get(canonical);
        existing.seen_by_providers = uniqueTokens([...(existing.seen_by_providers || []), ...providerList], 8);
        existing.seen_in_queries = uniqueTokens([...(existing.seen_in_queries || []), ...queryList], 20);
        existing.cross_provider_count = (existing.seen_by_providers || []).length;
      }
    } catch {
      // ignore malformed URL
    }
  }

  const candidateRows = [...byUrl.values()];
  const domainClassificationSeeds = collectDomainClassificationSeeds({
    searchResultRows: candidateRows,
    effectiveHostPlan,
    brandResolution,
  });
  const domainClassificationRows = [];
  // Domain safety: deterministic heuristics only (LLM call eliminated — zero correctness risk).
  if (domainClassificationSeeds.length > 0) {
    for (const domain of domainClassificationSeeds) {
      const blocked = isDeniedHost(domain, categoryConfig);
      const approved = !blocked && isApprovedHost(domain, categoryConfig);
      const tier = Number(resolveTierForHost(domain, categoryConfig) || 0);
      const baseScore = blocked
        ? 10
        : approved
          ? 90
          : tier === 1
            ? 80
            : tier === 2
              ? 70
              : tier === 3
                ? 60
                : 50;
      domainClassificationRows.push({
        domain,
        role: String(inferRoleForHost(domain, categoryConfig) || '').trim(),
        safety_class: blocked ? 'blocked' : (approved ? 'safe' : 'caution'),
        budget_score: baseScore,
        cooldown_remaining: 0,
        success_rate: 0,
        avg_latency_ms: 0,
        notes: blocked ? 'category_denylist' : 'deterministic_heuristic'
      });
    }
  }
  const domainSafetyResults = new Map();
  for (const row of domainClassificationRows) {
    domainSafetyResults.set(row.domain, {
      safe: row.safety_class !== 'blocked',
      classification: row.safety_class,
      reason: row.notes,
    });
  }
  if (domainClassificationRows.length > 0) {
    logger?.info?.('domains_classified', {
      classifications: domainClassificationRows.slice(0, 50)
    });
  }

  // ── SERP Selector (LLM-only, no deterministic fallback) ──
  const { selectorInput, candidateMap, overflowRows } = buildSerpSelectorInput({
    runId, category: categoryConfig.category, productId: job.productId,
    variables, identityLock, brandResolution,
    missingFields, missingCriticalFields: missingFields,
    focusFields: toArray(focusGroups),
    effectiveHostPlan, searchProfileBase,
    candidateRows, queryMetaByQuery: new Map(
      toArray(searchProfilePlanned?.query_rows).map((row) => [String(row?.query || '').trim(), row || {}])
    ),
    categoryConfig, frontierDb,
    discoveryCap,
    serpSelectorUrlCap: Number(config?.serpSelectorUrlCap || 0) || undefined,
    domainClassifierUrlCap: Number(config?.domainClassifierUrlCap || 0) || undefined,
  });
  const sentCandidateIds = [...candidateMap.keys()];

  const callSelector = _serpSelectorCallFn || createSerpSelectorCallLlm({
    callRoutedLlmFn: callLlmWithRouting, config, logger,
  });

  let selectorOutput = null;
  let validation = { valid: false, reason: '' };
  try {
    selectorOutput = await callSelector({ selectorInput, llmContext: {
      category: categoryConfig.category,
      productId: job.productId,
      runId,
      ...llmContext,
    }});
    validation = validateSelectorOutput({
      selectorOutput,
      candidateIds: sentCandidateIds,
      maxTotalKeep: selectorInput.selection_limits.max_total_keep,
    });
    if (!validation.valid) {
      logger?.warn?.('serp_selector_invalid_output', { reason: validation.reason });
    }
  } catch (err) {
    logger?.warn?.('serp_selector_failed', { error: String(err?.message || 'unknown') });
  }

  // WHY: No deterministic fallback. On any failure, treat as all-reject
  // so the run continues with zero selected URLs rather than garbage.
  const validOutput = validation.valid ? selectorOutput : {
    keep_ids: [], approved_ids: [], candidate_ids: [],
    reject_ids: [...sentCandidateIds],
    results: [...sentCandidateIds].map((id) => ({
      id, decision: 'reject', score: 0, confidence: 'low',
      fetch_rank: null, page_type: 'unknown', authority_bucket: 'unknown',
      reason_code: 'unclear', reason: 'selector_output_invalid',
    })),
    summary: { input_count: sentCandidateIds.length, approved_count: 0, candidate_count: 0, reject_count: sentCandidateIds.length },
  };

  const { selected, notSelected, laneStats, laneQuotas } = adaptSerpSelectorOutput({
    selectorOutput: validOutput, candidateMap, overflowRows,
  });
  const laneBoostReasons = [];

  const discovered = selected;

  // ── Phase 7: Reject audit ──
  const auditSamples = sampleRejectAudit({ hardDrops, notSelected });
  const auditTrail = buildAuditTrail({ auditSamples, hardDrops, notSelected, selected });

  // ── Trace writing + logging ──
  if (runtimeTraceWriter) {
    const trace = await runtimeTraceWriter.writeJson({
      section: 'search',
      prefix: 'selected_urls',
      payload: {
        selected_count: discovered.length,
        selected_urls: discovered.slice(0, 80).map((row) => ({
          url: row.url,
          host: row.host,
          tier: row.tierName || row.tier_name || '',
          primary_lane: row.primary_lane || null,
          reason: row.triage_disposition || ''
        }))
      },
      ringSize: 60
    });
    logger?.info?.('discovery_urls_selected', {
      selected_count: discovered.length,
      selected_hosts_top: [...new Set(discovered.slice(0, 20).map((row) => row.host).filter(Boolean))].slice(0, 10),
      trace_path: trace.trace_path
    });
  }
  logger?.info?.('discovery_results_reranked', {
    discovered_count: discovered.length,
    approved_count: discovered.filter((item) => item.approved_domain || item.approvedDomain).length
  });

  // WHY: Emit serp_selector_completed so the bridge handler populates
  // the SERP Selector prefetch panel and enriches search worker URLs.
  // Built from validOutput.results (raw LLM decisions) + candidateMap (original URLs).
  const selectorDecisionMap = {
    approved: 'keep',
    candidate: 'maybe',
    reject: 'drop',
  };
  logger?.info?.('serp_selector_completed', {
    query: '',
    kept_count: validOutput.keep_ids.length,
    dropped_count: validOutput.reject_ids.length,
    candidates: toArray(validOutput.results).slice(0, 120).map((r) => {
      const orig = candidateMap.get(r.id) || {};
      return {
        url: String(orig.url || '').trim(),
        title: String(orig.title || '').trim(),
        domain: String(orig.host || '').trim(),
        snippet: String(orig.snippet || '').slice(0, 260),
        score: Number(r.score || 0),
        decision: selectorDecisionMap[r.decision] || 'drop',
        rationale: String(r.reason || '').trim(),
        score_components: {
          base_relevance: Number(r.score || 0),
          tier_boost: 0,
          identity_match: 0,
          penalties: 0,
        },
        role: String(orig.role || '').trim(),
        identity_prelim: String(r.confidence === 'high' ? 'exact' : r.confidence === 'medium' ? 'family' : 'uncertain').trim(),
        host_trust_class: String(r.authority_bucket || 'unknown').trim(),
        primary_lane: null,
        triage_disposition: r.decision === 'approved' ? 'fetch_high' : r.decision === 'candidate' ? 'fetch_normal' : 'fetch_low',
        doc_kind_guess: String(r.page_type || 'unknown').trim(),
        approval_bucket: r.decision === 'reject' ? '' : r.decision,
      };
    }),
  });

  const approvedOnly = discovered.filter((item) => item.approved_domain || item.approvedDomain);
  const candidateOnly = discovered.filter((item) => !(item.approved_domain || item.approvedDomain));
  const queryAttemptStats = buildQueryAttemptStats(searchAttempts);
  const attemptMap = new Map(queryAttemptStats.map((row) => [row.query, row]));
  const queryRowsEnriched = toArray(searchProfilePlanned.query_rows).map((row) => {
    const attempt = attemptMap.get(String(row?.query || '').trim());
    return {
      ...row,
      result_count: attempt?.result_count || 0,
      attempts: attempt?.attempts || 0,
      providers: attempt?.providers || [],
      frontier_cache: attempt?.frontier_cache || false
    };
  });

  // ── Trace finalization ──
  const candidateByUrl = new Map(
    candidateRows.map((row) => [String(row.url || '').trim(), row])
  );
  const selectedUrlSet = new Set(
    discovered.map((row) => String(row.url || '').trim()).filter(Boolean)
  );
  const { brandTokens, modelTokens } = normalizeIdentityTokens(variables);
  for (const trace of candidateTraceByUrl.values()) {
    const candidateRow = candidateByUrl.get(String(trace.url || '').trim());
    if (!candidateRow) {
      if (trace.decision !== 'rejected') {
        trace.decision = 'rejected';
        trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), 'triage_excluded'], 16);
      }
      continue;
    }

    const isSelected = selectedUrlSet.has(String(trace.url || '').trim());
    trace.decision = isSelected ? 'selected' : 'not_selected';
    trace.tier_guess = Number.isFinite(Number(candidateRow.tier))
      ? Number(candidateRow.tier)
      : (Number.isFinite(Number(trace.tier_guess)) ? Number(trace.tier_guess) : null);
    trace.tier_name_guess = String(candidateRow.tier_name || candidateRow.tierName || trace.tier_name_guess || '').trim();
    trace.approved_domain = Boolean(candidateRow.approved_domain || candidateRow.approvedDomain || trace.approved_domain);
    trace.doc_kind_guess = String(candidateRow.doc_kind_guess || trace.doc_kind_guess || '').trim();
    trace.triage_score = Number(candidateRow.score || 0);
    trace.triage_reason = String(candidateRow.triage_disposition || '').trim();

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
    trace.reason_codes = uniqueTokens(reasonCodes, 16);
  }

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
    pending: 0
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
      .slice(0, 40)
      .map((trace) => ({
        url: trace.url,
        title: String(trace.title || '').slice(0, 220),
        snippet: String(trace.snippet || '').slice(0, 260),
        host: trace.host,
        tier: trace.tier_guess,
        tier_name: trace.tier_name_guess,
        doc_kind: trace.doc_kind_guess || 'other',
        triage_score: Number.isFinite(Number(trace.triage_score))
          ? Number(Number(trace.triage_score).toFixed(3))
          : 0,
        triage_reason: trace.triage_reason || '',
        decision: trace.decision || 'pending',
        reason_codes: uniqueTokens(trace.reason_codes || [], 8),
        providers: uniqueTokens(trace.providers || [], 6),
        // Additive Stage 06 fields
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
      candidates: traces
    };
  });
  const candidateTraceRows = [...candidateTraceByUrl.values()];
  const serpExplorer = {
    generated_at: new Date().toISOString(),
    provider: config.searchEngines,
    // WHY: LLM selector is now the only triage path
    llm_selector_enabled: true,
    llm_selector_applied: validation.valid,
    llm_selector_model: resolvePhaseModel(config, 'serpSelector') || String(config.llmModelPlan || '').trim(),
    query_count: serpQueryRows.length,
    candidates_checked: candidateTraceRows.length,
    urls_triaged: candidateRows.length,
    urls_selected: selectedUrlSet.size,
    urls_rejected: candidateTraceRows.filter((row) => row.decision === 'rejected').length,
    dedupe_input: dedupeStats.total_input,
    dedupe_output: dedupeStats.total_output,
    duplicates_removed: dedupeStats.duplicates_removed,
    // Additive Stage 06 fields
    hard_drop_count: hardDrops.length,
    soft_exclude_count: notSelected.length,
    lane_stats: laneStats,
    lane_quotas: laneQuotas,
    lane_boost_reasons: laneBoostReasons || [],
    audit_trail: auditTrail,
    queries: serpQueryRows
  };

  const searchProfileFinal = {
    ...searchProfilePlanned,
    generated_at: new Date().toISOString(),
    status: 'executed',
    query_rows: queryRowsEnriched,
    query_stats: queryAttemptStats,
    discovered_count: discovered.length,
    approved_count: approvedOnly.length,
    candidate_count: candidateOnly.length,
    llm_query_planning: true,
    llm_query_model: resolvePhaseModel(config, 'searchPlanner') || String(config.llmModelPlan || '').trim(),
    llm_serp_selector: true,
    llm_serp_selector_model: resolvePhaseModel(config, 'serpSelector') || String(config.llmModelPlan || '').trim(),
    serp_explorer: serpExplorer
  };
  await writeSearchProfileArtifacts({
    storage,
    payload: searchProfileFinal,
    keys: searchProfileKeys
  });

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
    approved_count: approvedOnly.length,
    candidate_count: candidateOnly.length,
    queries,
    query_guard: searchProfileFinal.query_guard || null,
    query_reject_log: toArray(searchProfileFinal.query_reject_log).slice(0, 200),
    llm_queries: llmQueries,
    search_profile_key: searchProfileKeys.inputKey,
    search_profile_run_key: searchProfileKeys.runKey,
    search_profile_latest_key: searchProfileKeys.latestKey,
    uber_search_plan: uberSearchPlan || null,
    targeted_missing_fields: missingFields,
    internal_satisfied: internalSatisfied,
    external_search_reason: externalSearchReason,
    search_attempts: searchAttempts,
    search_journal: searchJournal,
    serp_explorer: serpExplorer,
    discovered
  };
  const candidatePayload = {
    category: categoryConfig.category,
    productId: job.productId,
    runId,
    generated_at: new Date().toISOString(),
    candidate_count: candidateOnly.length,
    candidates: candidateOnly
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

  return {
    enabled: true,
    discoveryKey,
    candidatesKey,
    candidates: discovered,
    approvedUrls: approvedOnly.map((item) => item.url),
    candidateUrls: candidateOnly.map((item) => item.url),
    queries,
    llm_queries: llmQueries,
    search_profile: searchProfileFinal,
    search_profile_key: searchProfileKeys.inputKey,
    search_profile_run_key: searchProfileKeys.runKey,
    search_profile_latest_key: searchProfileKeys.latestKey,
    provider_state: providerState,
    query_concurrency: queryConcurrency,
    uber_search_plan: uberSearchPlan || null,
    internal_satisfied: internalSatisfied,
    external_search_reason: externalSearchReason,
    search_attempts: searchAttempts,
    search_journal: searchJournal,
    serp_explorer: serpExplorer
  };
}
