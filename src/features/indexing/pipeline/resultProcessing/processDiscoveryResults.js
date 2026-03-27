// Post-execution result processing extracted from searchDiscovery.js.
// Takes raw search results and produces the final discovery output:
// hard-drop filter → URL normalization → LLM SERP selector → reject audit →
// trace enrichment → artifact writing → return value.

import { resolvePhaseModel } from '../../../../core/llm/client/routing.js';
import {
  toArray,
  SLOT_LABELS,
} from '../shared/discoveryIdentity.js';
import { normalizeHost } from '../shared/hostParser.js';
import {
  createCandidateTraceMap,
  enrichCandidateTraces,
} from './resultTraceBuilder.js';
import {
  classifyAndDeduplicateCandidates,
  classifyDomains,
} from './resultClassifier.js';
import {
  buildSerpExplorer,
  writeDiscoveryPayloads,
} from './resultPayloadBuilder.js';
import {
  buildQueryAttemptStats,
  writeSearchProfileArtifacts,
} from '../shared/helpers.js';
import { applyHardDropFilter } from './triageHardDropFilter.js';
import { sampleRejectAudit, buildAuditTrail } from './triageRejectAuditor.js';
import { buildSerpSelectorInput, validateSelectorOutput, adaptSerpSelectorOutput } from './serpSelector.js';
import { createSerpSelectorCallLlm } from './serpSelectorLlmAdapter.js';
import { callLlmWithRouting } from '../../../../core/llm/client/routing.js';
import { configInt } from '../../../../shared/settingsAccessor.js';

export async function processDiscoveryResults({
  // From executeSearchQueries return
  rawResults, searchAttempts, searchJournal, internalSatisfied, externalSearchReason,
  // Core services
  config, storage, categoryConfig, job, runId, logger, runtimeTraceWriter, frontierDb,
  // Identity & learning
  variables, identityLock, brandResolution, missingFields, learning,
  // LLM & planning
  llmContext, searchProfileBase, llmQueries,
  // Search profile & query state
  queries, searchProfilePlanned, searchProfileKeys, providerState,
  // DI seam for SERP selector (testing)
  _serpSelectorCallFn,
}) {
  const queryMetaByQuery = new Map(
    toArray(searchProfilePlanned?.query_rows).map((row) => [String(row?.query || '').trim(), row || {}])
  );
  const { ensureTrace, candidateTraceByUrl } = createCandidateTraceMap();

  // WHY: Build query→slot and (url,query)→rank maps for slot-ordered fetch queue.
  // queries array is ordered: index 0 = slot 'a', index 1 = slot 'b', etc.
  const queryToSlot = new Map();
  for (let i = 0; i < queries.length && i < SLOT_LABELS.length; i++) {
    const q = String(queries[i] || '').trim().toLowerCase();
    if (q && !queryToSlot.has(q)) queryToSlot.set(q, { slot: SLOT_LABELS[i], index: i });
  }
  const serpRankByUrlQuery = new Map();
  for (const raw of rawResults) {
    const url = String(raw?.url || '').trim();
    const query = String(raw?.query || '').trim().toLowerCase();
    const rank = Number(raw?.rank) || 0;
    if (url && query && rank > 0) {
      const key = `${url}::${query}`;
      if (!serpRankByUrlQuery.has(key) || rank < serpRankByUrlQuery.get(key)) {
        serpRankByUrlQuery.set(key, rank);
      }
    }
  }

  // ── Phase 2: Hard-drop filter (replaces inline non-HTTPS/denied/cooldown checks) ──
  const { survivors: hardDropSurvivors, hardDrops } = applyHardDropFilter({
    dedupedResults: rawResults,
    categoryConfig,
    frontierDb,
  });

  // Populate traces for hard-dropped URLs
  for (const drop of hardDrops) {
    ensureTrace(drop.url || drop.original_url, {
      host: drop.host || '',
      decision: 'rejected',
      reason_codes: [drop.hard_drop_reason],
    });
  }

  // ── Phase 2+3: Classify candidates + domain heuristics ──
  const { byUrl: classifiedByUrl, canonMergeCount } = classifyAndDeduplicateCandidates({
    hardDropSurvivors,
    queryMetaByQuery,
    frontierDb,
    categoryConfig,
    searchProfileBase,
    identityLock,
    ensureTrace,
  });
  const candidateRows = [...classifiedByUrl.values()];

  // ── SERP Selector (LLM with deterministic reranker fallback) ──
  const officialDomain = normalizeHost(String(brandResolution?.officialDomain || '').trim());
  const supportDomain = normalizeHost(String(brandResolution?.supportDomain || '').trim());

  const { selectorInput, candidateMap } = buildSerpSelectorInput({
    runId, category: categoryConfig.category, productId: job.productId,
    variables, brandResolution,
    candidateRows,
    categoryConfig,
    serpSelectorMaxKeep: configInt(config, 'serpSelectorMaxKeep'),
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
      maxTotalKeep: selectorInput.max_keep,
    });
    if (!validation.valid) {
      logger?.warn?.('serp_selector_invalid_output', { reason: validation.reason });
    }
  } catch (err) {
    logger?.warn?.('serp_selector_failed', { error: String(err?.message || 'unknown') });
  }

  // WHY: On LLM failure, pass through the already-priority-sorted candidates.
  // buildSerpSelectorInput already ranked them (pinned/multi-hit first).
  let validOutput;
  let fallbackApplied = false;
  if (validation.valid) {
    validOutput = selectorOutput;
  } else {
    validOutput = {
      keep_ids: selectorInput.candidates.map((c) => c.id).slice(0, selectorInput.max_keep),
    };
    fallbackApplied = true;
    logger?.info?.('serp_selector_fallback_activated', {
      fallback_count: validOutput.keep_ids.length,
      max_keep: selectorInput.max_keep,
    });
  }

  const { selected, notSelected } = adaptSerpSelectorOutput({
    selectorOutput: validOutput, candidateMap,
    officialDomain, supportDomain, categoryConfig,
    scoreSource: fallbackApplied ? 'passthrough_fallback' : 'llm_selector',
  });

  // WHY: Enrich selected candidates with search_slot + search_rank so the
  // planner can sort the fetch queue in strict slot order (a1→a2→b1→b2...).
  for (const candidate of selected) {
    const seenQueries = toArray(candidate.seen_in_queries);
    let bestSlot = null;
    let bestRank = null;
    for (const q of seenQueries) {
      const qLower = String(q || '').trim().toLowerCase();
      const slotInfo = queryToSlot.get(qLower);
      if (slotInfo && (!bestSlot || slotInfo.index < bestSlot.index)) {
        bestSlot = slotInfo;
        bestRank = serpRankByUrlQuery.get(`${candidate.url}::${qLower}`) ?? null;
      }
    }
    candidate.search_slot = bestSlot?.slot ?? null;
    candidate.search_rank = bestSlot ? bestRank : null;
  }

  const discovered = selected;
  const candidateRowsFinal = [...selected, ...notSelected];

  // WHY: Domain classification runs AFTER the SERP selector — only classify
  // URLs that the LLM selected, not the full candidate pool. The domain
  // classifier panel must reflect the URLs actually entering the planner.
  classifyDomains({
    candidateRows: selected,
    brandResolution,
    categoryConfig,
    frontierDb,
    logger,
  });

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
        selected_urls: discovered.map((row) => ({
          url: row.url,
          host: row.host,
          tier: row.tierName || '',
          reason: row.triage_disposition || ''
        }))
      },
      ringSize: 60
    });
    logger?.info?.('discovery_urls_selected', {
      selected_count: discovered.length,
      selected_hosts_top: [...new Set(discovered.map((row) => row.host).filter(Boolean))],
      trace_path: trace.trace_path
    });
  }
  logger?.info?.('discovery_results_reranked', {
    discovered_count: candidateRowsFinal.length,
    approved_count: discovered.filter((item) => item.approvedDomain).length
  });

  // WHY: Emit serp_selector_completed so the bridge handler populates
  // the SERP Selector prefetch panel and enriches search worker URLs.
  const keepIdSet = new Set(toArray(validOutput.keep_ids));
  logger?.info?.('serp_selector_completed', {
    query: '',
    kept_count: selected.length,
    dropped_count: notSelected.length,
    funnel: {
      raw_input: new Set((rawResults || []).map((r) => String(r?.url || '').trim()).filter(Boolean)).size,
      hard_drop_count: hardDrops.length,
      candidates_after_hard_drop: hardDropSurvivors.length,
      canon_merge_count: canonMergeCount,
      candidates_classified: candidateRows.length,
      candidates_sent_to_llm: selectorInput.candidates.length,
      overflow_capped: 0,
      llm_model: resolvePhaseModel(config, 'serpSelector') || String(config.llmModelPlan || '').trim(),
      llm_applied: validation.valid,
      fallback_applied: fallbackApplied,
    },
    candidates: [
      ...[...candidateMap.entries()].map(([id, orig]) => {
        const isKept = keepIdSet.has(id);
        const enriched = isKept ? selected.find((r) => r.url === orig.url) : null;
        return {
          url: String(orig.url || '').trim(),
          title: String(orig.title || '').trim(),
          domain: String(orig.host || '').trim(),
          snippet: String(orig.snippet || ''),
          score: enriched?.score || 0,
          decision: isKept ? 'keep' : 'drop',
          rationale: isKept ? (fallbackApplied ? 'passthrough_fallback' : 'llm_selected') : 'not_selected',
          score_components: { base_relevance: enriched?.score || 0, tier_boost: 0, identity_match: 0, penalties: 0 },
          role: '',
          identity_prelim: enriched?.identity_prelim || 'uncertain',
          host_trust_class: enriched?.host_trust_class || 'unknown',
          triage_disposition: enriched?.triage_disposition || 'fetch_low',
          doc_kind_guess: enriched?.doc_kind_guess || 'unknown',
          approval_bucket: isKept ? 'approved' : '',
        };
      }),
      ...hardDrops.map((drop) => ({
        url: String(drop.url || '').trim(),
        title: String(drop.title || '').trim(),
        domain: String(drop.host || drop.domain || '').trim(),
        snippet: String(drop.snippet || ''),
        score: 0,
        decision: 'hard_drop',
        rationale: drop.hard_drop_reason || 'hard_drop',
        score_components: { base_relevance: 0, tier_boost: 0, identity_match: 0, penalties: 0 },
        role: '',
        identity_prelim: '',
        host_trust_class: '',
        triage_disposition: drop.hard_drop_reason || 'hard_drop',
        doc_kind_guess: '',
        approval_bucket: '',
      })),
    ],
  });

  const selectedUrls = discovered.map((item) => item.url);
  const allCandidateUrls = candidateRowsFinal
    .map((item) => String(item?.url || '').trim())
    .filter(Boolean);
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
  enrichCandidateTraces({
    candidateTraceByUrl,
    candidateByUrl,
    selectedUrlSet,
    variables,
    queryMetaByQuery,
  });

  // ── Phase 7: Build SERP explorer ──
  const serpExplorer = buildSerpExplorer({
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
    fallbackApplied,
  });

  const searchProfileFinal = {
    ...searchProfilePlanned,
    generated_at: new Date().toISOString(),
    status: 'executed',
    query_rows: queryRowsEnriched,
    query_stats: queryAttemptStats,
    discovered_count: candidateRowsFinal.length,
    approved_count: selectedUrls.length,
    candidate_count: candidateRowsFinal.length,
    selected_count: selectedUrls.length,
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

  // ── Phase 9: Write discovery + candidates payloads ──
  const { discoveryKey, candidatesKey } = await writeDiscoveryPayloads({
    config, storage, categoryConfig, job, runId,
    queries, llmQueries, missingFields,
    internalSatisfied, externalSearchReason,
    searchAttempts, searchJournal,
    providerState,
    searchProfileFinal, serpExplorer,
    candidateRowsFinal, discovered,
    selectedUrls, searchProfileKeys,
  });

  return {
    enabled: true,
    discoveryKey,
    candidatesKey,
    candidates: candidateRowsFinal,
    selectedUrls,
    allCandidateUrls,
    queries,
    llm_queries: llmQueries,
    search_profile: searchProfileFinal,
    search_profile_key: searchProfileKeys.inputKey,
    search_profile_run_key: searchProfileKeys.runKey,
    search_profile_latest_key: searchProfileKeys.latestKey,
    provider_state: providerState,
    internal_satisfied: internalSatisfied,
    external_search_reason: externalSearchReason,
    search_attempts: searchAttempts,
    search_journal: searchJournal,
    serp_explorer: serpExplorer,
  };
}
