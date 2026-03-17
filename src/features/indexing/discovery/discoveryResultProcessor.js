// Post-execution result processing extracted from searchDiscovery.js.
// Takes raw search results and produces the final discovery output:
// SERP dedup, URL candidate building, domain classification + admission,
// deterministic reranking, conditional LLM SERP triage, trace enrichment,
// searchProfileFinal assembly, artifact writing, and return value.

import { toPosixKey } from '../../../s3/storage.js';
import {
  inferRoleForHost,
  isApprovedHost,
  isDeniedHost,
  resolveTierForHost,
} from '../../../categories/loader.js';
import { rerankSearchResults } from '../search/resultReranker.js';
import { rerankSerpResults } from '../../../research/serpReranker.js';
import { dedupeSerpResults } from '../search/serpDedupe.js';
import {
  normalizeHost,
  toArray,
  uniqueTokens,
  countTokenHits,
  normalizeIdentityTokens,
  manufacturerHostHintsForBrand,
  manufacturerHostMatchesBrand,
} from './discoveryIdentity.js';
import {
  classifyUrlCandidate,
  docHintMatchesDocKind,
  resolveDiscoveryAdmissionExclusionReason,
  isRelevantSearchResult,
  collectDomainClassificationSeeds,
} from './discoveryUrlClassifier.js';
import {
  buildQueryAttemptStats,
  writeSearchProfileArtifacts,
  normalizeTriageScore,
} from './discoveryHelpers.js';

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
  const manufacturerHostHints = manufacturerHostHintsForBrand(identityLock.brand || '');
  for (const raw of dedupedResults) {
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
      if (parsed.protocol !== 'https:') {
        if (trace) {
          trace.decision = 'rejected';
          trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), 'non_https'], 16);
        }
        continue;
      }
      const host = normalizeHost(parsed.hostname);
      if (!host || isDeniedHost(host, categoryConfig)) {
        if (trace) {
          trace.decision = 'rejected';
          trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), 'denied_host'], 16);
        }
        continue;
      }
      const skipByCooldown = frontierDb?.shouldSkipUrl?.(parsed.toString()) || { skip: false };
      if (skipByCooldown.skip) {
        if (trace) {
          trace.decision = 'rejected';
          trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), 'url_cooldown'], 16);
        }
        logger?.info?.('url_cooldown_applied', {
          url: parsed.toString(),
          status: null,
          cooldown_seconds: null,
          reason: skipByCooldown.reason || 'frontier_cooldown'
        });
        continue;
      }
      const classified = classifyUrlCandidate(raw, categoryConfig, {
        identityLock,
        variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms)
      });
      if (
        classified.role === 'manufacturer' &&
        manufacturerHostHints.length > 0 &&
        !manufacturerHostMatchesBrand(classified.host, manufacturerHostHints)
      ) {
        if (trace) {
          trace.decision = 'rejected';
          trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), 'manufacturer_brand_mismatch'], 16);
        }
        continue;
      }
      if (!isRelevantSearchResult({
        parsed,
        raw,
        classified,
        variables
      })) {
        if (trace) {
          trace.decision = 'rejected';
          trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), 'low_relevance'], 16);
        }
        continue;
      }
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
  // isDeniedHost, isApprovedHost, resolveTierForHost, inferRoleForHost cover all safety decisions.
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
  // Build domainSafetyResults Map from deterministic rows so admission exclusion can use it
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

  const excludedByAdmission = [];
  const admittedCandidateRows = candidateRows.filter((row) => {
    const exclusionReason = resolveDiscoveryAdmissionExclusionReason({
      row,
      domainSafetyResults,
      variables
    });
    if (!exclusionReason) {
      return true;
    }
    excludedByAdmission.push({
      url: row.url,
      host: row.host,
      reason: exclusionReason
    });
    const trace = candidateTraceByUrl.get(String(row.url || '').trim());
    if (trace) {
      trace.decision = 'rejected';
      trace.triage_reason = exclusionReason;
      trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), exclusionReason], 16);
    }
    return false;
  });
  if (excludedByAdmission.length > 0) {
    logger?.info?.('discovery_admission_filtered', {
      excluded_count: excludedByAdmission.length,
      rows: excludedByAdmission.slice(0, 50)
    });
  }

  const deterministicReranked = rerankSearchResults({
    results: admittedCandidateRows,
    categoryConfig,
    missingFields,
    fieldYieldMap: learning.fieldYield
  });
  let reranked = deterministicReranked;

  const triageEnabledSetting = config.serpTriageEnabled !== false;
  const triageMinScore = Math.max(0, Number.parseFloat(String(config.serpTriageMinScore ?? 0)) || 0);
  const triageMaxUrls = Math.max(1, Number.parseInt(String(config.serpTriageMaxUrls ?? discoveryCap), 10) || discoveryCap);
  const llmTriageConfigEnabled = Boolean(
    triageEnabledSetting
    && (uberMode || config.llmSerpRerankEnabled),
  );
  // Conditional LLM triage: skip LLM when deterministic reranking already produces
  // enough high-quality results (>= 60% of triageMaxUrls above triageMinScore).
  const highQualityCount = deterministicReranked
    .filter((r) => (Number(r.score) || 0) >= triageMinScore).length;
  const needsLlmTriage = highQualityCount < Math.ceil(triageMaxUrls * 0.6);
  const llmTriageEnabled = llmTriageConfigEnabled && needsLlmTriage;
  if (llmTriageConfigEnabled && !needsLlmTriage) {
    logger?.info?.('llm_triage_skipped', {
      reason: 'sufficient_deterministic_quality',
      high_quality_count: highQualityCount,
      threshold: Math.ceil(triageMaxUrls * 0.6),
    });
  }
  let llmTriageApplied = false;
  let deterministicTriageApplied = false;
  if (llmTriageEnabled) {
    const llmReranked = await rerankSerpResults({
      config,
      logger,
      llmContext,
      identity: identityLock,
      missingFields,
      serpResults: admittedCandidateRows,
      frontier: frontierDb,
      topK: Math.max(discoveryCap, triageMaxUrls, Number(config.discoveryResultsPerQuery || 10) * 2),
      domainSafetyResults
    });
    const llmExplicitAllDrop = Boolean(llmReranked?.explicitAllDrop);
    if (llmReranked.length > 0 || llmExplicitAllDrop) {
      const llmRows = llmExplicitAllDrop
        ? toArray(llmReranked?.explicitAllDropRows)
        : llmReranked;
      const triageFiltered = llmReranked.filter((row) => normalizeTriageScore(row) >= triageMinScore);
      const triageSelected = (triageFiltered.length > 0 ? triageFiltered : llmReranked)
        .slice(0, triageMaxUrls);
      reranked = triageSelected;
      llmTriageApplied = true;
      const kept = triageSelected.filter((r) => r?.decision !== 'drop');
      const dropped = llmExplicitAllDrop
        ? llmRows
        : llmRows.filter((r) => !triageSelected.includes(r) || r?.decision === 'drop');
      logger?.info?.('serp_triage_completed', {
        query: '',
        kept_count: kept.length,
        dropped_count: dropped.length,
        triage_min_score: triageMinScore,
        triage_max_urls: triageMaxUrls,
        candidates: llmRows.slice(0, 40).map((r) => ({
          url: String(r?.url || '').trim(),
          title: String(r?.title || '').trim(),
          domain: String(r?.host || '').trim(),
          snippet: String(r?.snippet || '').trim().slice(0, 300),
          score: normalizeTriageScore(r),
          decision: String(r?.decision || 'keep').trim(),
          rationale: String(r?.rerank_reason || r?.reason_code || '').trim(),
          score_components: r?.score_components && typeof r.score_components === 'object'
            ? r.score_components
            : { base_relevance: 0, tier_boost: 0, identity_match: 0, penalties: 0 }
        }))
      });
    } else {
      logger?.info?.('serp_triage_completed', {
        query: '',
        kept_count: 0,
        dropped_count: 0,
        triage_min_score: triageMinScore,
        triage_max_urls: triageMaxUrls,
        candidates: []
      });
    }
  }
  if (triageEnabledSetting && !llmTriageApplied && deterministicReranked.length > 0) {
    const thresholdFiltered = deterministicReranked.filter(
      (row) => Number.parseFloat(String(row?.score ?? 0)) >= triageMinScore
    );
    const triageSelected = (thresholdFiltered.length > 0 ? thresholdFiltered : deterministicReranked)
      .slice(0, triageMaxUrls);
    const selectedUrlSet = new Set(triageSelected.map((row) => String(row?.url || '').trim()).filter(Boolean));
    reranked = triageSelected;
    deterministicTriageApplied = true;
    logger?.info?.('serp_triage_completed', {
      query: '',
      kept_count: triageSelected.length,
      dropped_count: Math.max(0, deterministicReranked.length - triageSelected.length),
      triage_min_score: triageMinScore,
      triage_max_urls: triageMaxUrls,
      candidates: deterministicReranked.slice(0, 40).map((row) => {
        const url = String(row?.url || '').trim();
        const score = Number.parseFloat(String(row?.score ?? 0)) || 0;
        return {
          url,
          title: String(row?.title || '').trim(),
          domain: String(row?.host || '').trim(),
          snippet: String(row?.snippet || '').trim().slice(0, 300),
          score,
          decision: selectedUrlSet.has(url) ? 'keep' : 'drop',
          rationale: 'deterministic_rerank',
          score_components: {
            base_relevance: score,
            tier_boost: 0,
            identity_match: 0,
            penalties: 0
          }
        };
      })
    });
  }
  const triageApplied = llmTriageApplied || deterministicTriageApplied;
  const discoveredCap = triageApplied
    ? Math.max(1, Math.min(discoveryCap, triageMaxUrls))
    : discoveryCap;
  const discovered = reranked.slice(0, discoveredCap);
  const discoveredUrlSet = new Set(discovered.map((item) => item.url));
  // Tier coverage override removed: deterministic reranker already gives lab/database
  // a tier boost (+1.5/+0.5). Pure score order is respected.
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
          reason: row.rerank_reason || row.reason_code || ''
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

  const rerankedByUrl = new Map(
    reranked.map((row) => [String(row.url || '').trim(), row])
  );
  const selectedUrlSet = new Set(
    discovered.map((row) => String(row.url || '').trim()).filter(Boolean)
  );
  const { brandTokens, modelTokens } = normalizeIdentityTokens(variables);
  for (const trace of candidateTraceByUrl.values()) {
    const rerankedRow = rerankedByUrl.get(String(trace.url || '').trim());
    if (!rerankedRow) {
      if (trace.decision !== 'rejected') {
        trace.decision = 'rejected';
        trace.reason_codes = uniqueTokens([...(trace.reason_codes || []), 'triage_excluded'], 16);
      }
      continue;
    }

    const isSelected = selectedUrlSet.has(String(trace.url || '').trim());
    trace.decision = isSelected ? 'selected' : 'not_selected';
    trace.tier_guess = Number.isFinite(Number(rerankedRow.tier))
      ? Number(rerankedRow.tier)
      : (Number.isFinite(Number(trace.tier_guess)) ? Number(trace.tier_guess) : null);
    trace.tier_name_guess = String(rerankedRow.tier_name || rerankedRow.tierName || trace.tier_name_guess || '').trim();
    trace.approved_domain = Boolean(rerankedRow.approved_domain || rerankedRow.approvedDomain || trace.approved_domain);
    trace.doc_kind_guess = String(rerankedRow.doc_kind_guess || trace.doc_kind_guess || '').trim();
    trace.triage_score = Number.isFinite(Number(rerankedRow.rerank_score))
      ? Number(rerankedRow.rerank_score)
      : Number(rerankedRow.score || 0);
    trace.triage_reason = String(rerankedRow.rerank_reason || rerankedRow.reason_code || '').trim();

    const haystack = `${trace.title || ''} ${trace.snippet || ''} ${trace.url || ''}`.toLowerCase();
    const reasonCodes = [...(trace.reason_codes || [])];
    if (trace.approved_domain) reasonCodes.push('approved_domain');
    if (trace.tier_guess === 1) reasonCodes.push('tier_1');
    if (trace.tier_guess === 2) reasonCodes.push('tier_2');
    if (String(trace.doc_kind_guess || '').includes('pdf')) reasonCodes.push('doc_pdf');
    if ((rerankedRow.cross_provider_count || 0) > 1) reasonCodes.push('cross_provider_multi');
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
        providers: uniqueTokens(trace.providers || [], 6)
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
    provider: config.searchProvider,
    llm_triage_enabled: llmTriageEnabled,
    llm_triage_applied: llmTriageApplied,
    llm_triage_model: llmTriageEnabled
      ? String(
        config.llmModelTriage ||
        config.llmModelFast ||
        ''
      ).trim()
      : '',
    query_count: serpQueryRows.length,
    candidates_checked: candidateTraceRows.length,
    urls_triaged: reranked.length,
    urls_selected: selectedUrlSet.size,
    urls_rejected: candidateTraceRows.filter((row) => row.decision === 'rejected').length,
    dedupe_input: dedupeStats.total_input,
    dedupe_output: dedupeStats.total_output,
    duplicates_removed: dedupeStats.duplicates_removed,
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
    llm_query_model: String(config.llmModelPlan || '').trim(),
    llm_serp_triage: llmTriageEnabled,
    llm_serp_triage_model: String(config.llmModelTriage || config.llmModelFast || '').trim(),
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
    provider: config.searchProvider,
    provider_state: providerState,
    query_concurrency: queryConcurrency,
    llm_query_planning: true,
    llm_query_model: String(config.llmModelPlan || '').trim(),
    llm_serp_triage: llmTriageEnabled,
    llm_serp_triage_model: String(config.llmModelTriage || config.llmModelFast || '').trim(),
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
