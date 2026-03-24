import { extractRootDomain } from '../../../utils/common.js';
import { configInt } from '../../../shared/settingsAccessor.js';
import { searchEngineAvailability } from '../search/searchProviders.js';
import { enhanceQueryRows } from '../../../research/queryPlanner.js';
import {
  buildSearchProfile,
} from '../search/queryBuilder.js';
import { normalizeFieldList } from '../../../utils/fieldKeys.js';
import { resolveBrandDomain } from './brandResolver.js';
import { callLlmWithRouting, hasLlmRouteApiKey } from '../../../core/llm/client/routing.js';
import {
  createBrandResolverCallLlm,
} from './discoveryLlmAdapters.js';
import {
  normalizeHost,
  resolveJobIdentity,
  toArray,
} from './discoveryIdentity.js';
import {
  dedupeQueryRows,
  prioritizeQueryRows,
  enforceIdentityQueryGuard,
} from './discoveryQueryPlan.js';
import {
  computeIdentityMatchLevel as _computeIdentityMatchLevel,
  detectVariantGuardHit as _detectVariantGuardHit,
  detectMultiModelHint as _detectMultiModelHint,
} from './discoveryUrlClassifier.js';
import {
  mergeLearningStoreHintsIntoLexicon,
  loadLearningArtifacts,
  buildSearchProfileKeys,
  writeSearchProfileArtifacts,
  ensureCategorySourceLookups,
  resolveSearchProfileCaps,
  resolveEnabledSourceEntries as _resolveEnabledSourceEntries,
} from './discoveryHelpers.js';
import { executeSearchQueries } from './discoverySearchExecution.js';
import { processDiscoveryResults } from './discoveryResultProcessor.js';

// Phase 3 extraction: URL classification, admission gate, doc-kind,
// relevance, sibling detection, forum detection → discoveryUrlClassifier.js

// Backward-compatible re-exports (consumed by test files)
export const computeIdentityMatchLevel = _computeIdentityMatchLevel;
export const detectVariantGuardHit = _detectVariantGuardHit;
export const detectMultiModelHint = _detectMultiModelHint;

// Phase 4A extraction: helpers → discoveryHelpers.js
export const resolveEnabledSourceEntries = _resolveEnabledSourceEntries;

export async function discoverCandidateSources({
  config,
  storage,
  categoryConfig,
  job,
  runId,
  logger,
  planningHints = {},
  llmContext = {},
  frontierDb = null,
  runtimeTraceWriter = null,
  learningStoreHints = null,
  sourceEntries = null,
  brandResolution: preComputedBrandResolution = null,
  _runSearchProvidersFn,
  _searchSourceCorpusFn,
  _executeSearchQueriesFn,
}) {
  if (!config.discoveryEnabled) {
    // WHY: Defensive emit so prefetch GUI always gets brand_resolved feedback
    // even if something bypasses the discoveryEnabled invariant.
    logger?.info?.('brand_resolved', {
      brand: job?.brand || '',
      status: 'skipped',
      skip_reason: 'discovery_disabled',
      official_domain: '',
      aliases: [],
      support_domain: '',
      confidence: 0,
      candidates: [],
      reasoning: [],
    });
    return {
      enabled: false,
      discoveryKey: null,
      candidatesKey: null,
      candidates: [],
      selectedUrls: [],
      queries: [],
      llm_queries: [],
      search_profile: null,
      search_profile_key: null,
      search_profile_run_key: null,
      search_profile_latest_key: null
    };
  }

  categoryConfig = ensureCategorySourceLookups(categoryConfig);

  const resolvedIdentity = resolveJobIdentity(job);
  const variables = {
    brand: resolvedIdentity.brand,
    model: resolvedIdentity.model,
    variant: resolvedIdentity.variant,
    category: job.category || categoryConfig.category
  };
  const missingFields = normalizeFieldList([
    ...toArray(planningHints.missingRequiredFields),
    ...toArray(planningHints.missingCriticalFields),
    ...toArray(job.requirements?.focus_fields || job.requirements?.llmTargetFields)
  ], {
    fieldOrder: categoryConfig.fieldOrder || []
  });

  const learning = await loadLearningArtifacts({
    storage,
    category: categoryConfig.category
  });
  // WHY: Brand resolution may be pre-computed by the orchestrator (runDiscoverySeedPlan)
  // so the search planner can use brand data. When pre-computed, skip internal resolution.
  let brandResolution = preComputedBrandResolution;
  let brandStatus = 'skipped';
  let brandSkipReason = '';
  if (brandResolution) {
    brandStatus = brandResolution.officialDomain ? 'resolved' : 'resolved_empty';
    brandSkipReason = '';
  } else if (!variables.brand) {
    brandSkipReason = 'no_brand_in_identity_lock';
  } else {
    try {
      const canCallBrandResolverLlm = Boolean(hasLlmRouteApiKey(config, { role: 'triage' }));
      const brandCallLlm = canCallBrandResolverLlm
        ? createBrandResolverCallLlm({
          callRoutedLlmFn: callLlmWithRouting,
          config,
          logger
        })
        : null;
      brandResolution = await resolveBrandDomain({
        brand: variables.brand,
        category: variables.category,
        config,
        callLlmFn: brandCallLlm,
        storage
      });
      if (brandResolution?.officialDomain) {
        brandStatus = 'resolved';
        brandSkipReason = '';
      } else if (canCallBrandResolverLlm) {
        brandStatus = 'resolved_empty';
      } else {
        brandStatus = 'skipped';
        brandSkipReason = 'no_api_key_for_triage_role';
      }
    } catch (err) {
      brandStatus = 'failed';
      brandSkipReason = String(err?.message || 'unknown_error');
    }
  }
  logger?.info?.('brand_resolved', {
    brand: variables.brand || '',
    status: brandStatus,
    skip_reason: brandSkipReason,
    official_domain: brandResolution?.officialDomain || '',
    aliases: brandResolution?.aliases?.slice(0, 5) || [],
    support_domain: brandResolution?.supportDomain || '',
    confidence: brandResolution?.confidence ?? null,
    reasoning: Array.isArray(brandResolution?.reasoning) ? brandResolution.reasoning.slice(0, 10) : []
  });

  const enrichedLexicon = mergeLearningStoreHintsIntoLexicon(learning.lexicon, learningStoreHints);
  const searchProfileCaps = resolveSearchProfileCaps(config);
  const identityLock = {
    brand: resolvedIdentity.brand,
    model: resolvedIdentity.model,
    variant: resolvedIdentity.variant,
    productId: job.productId || ''
  };
  const searchProfileKeys = buildSearchProfileKeys({
    storage,
    config,
    category: categoryConfig.category,
    productId: job.productId,
    runId
  });

  // === Stage 03: Search Profile (ALWAYS runs — deterministic query generation) ===
  const profileMaxQueries = configInt(config, 'searchProfileQueryCap');
  const searchProfileBase = buildSearchProfile({
    job,
    categoryConfig,
    missingFields,
    lexicon: enrichedLexicon,
    learnedQueries: learning.queryTemplates,
    maxQueries: profileMaxQueries,
    brandResolution,
    aliasValidationCap: searchProfileCaps.llmAliasValidationCap,
    fieldTargetQueriesCap: searchProfileCaps.llmFieldTargetQueriesCap,
    docHintQueriesCap: searchProfileCaps.llmDocHintQueriesCap,
    fieldYieldByDomain: learning.fieldYield?.by_domain || null,
  });

  // WHY: Emit search_profile_generated HERE (Stage 03) with deterministic-only
  // data. The merged count belongs to query_journey_completed (Stage 05).
  logger?.info?.('search_profile_generated', {
    run_id: runId,
    category: categoryConfig.category,
    product_id: job.productId,
    alias_count: toArray(searchProfileBase?.identity_aliases).length,
    query_count: toArray(searchProfileBase?.queries).length,
    source: 'deterministic',
    query_rows: toArray(searchProfileBase?.query_rows).slice(0, 220).map((row) => ({
      query: String(row?.query || '').trim(),
      hint_source: String(row?.hint_source || '').trim(),
      target_fields: Array.isArray(row?.target_fields) ? row.target_fields : [],
      doc_hint: String(row?.doc_hint || '').trim(),
      domain_hint: String(row?.domain_hint || '').trim(),
      source_host: String(row?.source_host || '').trim(),
      attempts: 0,
      result_count: 0,
      providers: [],
      score: Number.isFinite(Number(row?.score)) ? Number(row.score) : 0,
      score_breakdown: row?.score_breakdown && typeof row.score_breakdown === 'object'
        ? row.score_breakdown : null,
      warnings: Array.isArray(row?.warnings) ? row.warnings : [],
    })),
  });

  // === Stage 04: Search Planner (LLM enrichment) ===
  const baseQueries = toArray(searchProfileBase?.base_templates);
  const targetedQueries = toArray(searchProfileBase?.queries);
  const profileQueryRowsByQuery = new Map(
    toArray(searchProfileBase?.query_rows).map((row) => {
      const token = String(row?.query || '').trim().toLowerCase();
      return [token, row];
    })
  );
  const resolveProfileQueryRow = (query) => profileQueryRowsByQuery.get(String(query || '').trim().toLowerCase()) || null;

  // WHY: enhanceQueryRows is the Search Planner's LLM call (Stage 04).
  // It enriches deterministic query rows with LLM-refined queries.
  // Enhanced rows get hint_source suffixed with '_llm'.
  const enhancedResult = await enhanceQueryRows({
    queryRows: toArray(searchProfileBase?.query_rows),
    queryHistory: [...baseQueries, ...targetedQueries],
    missingFields,
    identityLock: { brand: variables.brand, model: variables.model, variant: variables.variant },
    config,
    logger,
  });

  const allEnhancedRows = toArray(enhancedResult?.rows);
  const enhancedLlmRows = allEnhancedRows.filter(
    (row) => String(row?.hint_source || '').endsWith('_llm')
  );
  logger?.info?.('search_plan_generated', {
    pass_index: 0,
    pass_name: 'primary',
    source: enhancedResult?.source || 'deterministic_fallback',
    total_rows: allEnhancedRows.length,
    llm_enhanced_count: enhancedLlmRows.length,
    mode: String(llmContext?.mode || 'standard'),
    queries_generated: enhancedLlmRows.map((r) => r.query),
    stop_condition: enhancedLlmRows.length > 0 ? 'planner_complete' : 'deterministic_fallback',
    plan_rationale: enhancedLlmRows.length > 0
      ? `LLM planner enhanced ${enhancedLlmRows.length} queries`
      : `Deterministic fallback — ${allEnhancedRows.length} queries unchanged`,
    query_target_map: {},
    missing_critical_fields: toArray(planningHints.missingCriticalFields).slice(0, 30),
    enhancement_rows: allEnhancedRows.map((r) => ({
      query: String(r.query || '').trim(),
      original_query: String(r.original_query || r.query || '').trim(),
      hint_source: String(r.hint_source || '').trim(),
      tier: String(r.tier || '').trim(),
      group_key: String(r.group_key || '').trim(),
      target_fields: toArray(r.target_fields),
    })),
  });

  // === Stage 05: Query Journey (merge ALL streams — no branching) ===
  // WHY: Two input streams merged into one candidate list:
  // 1. Deterministic base + targeted queries (from search profile)
  // 2. LLM-enhanced query rows (from enhanceQueryRows)
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
        hint_source: String(profileRow?.hint_source || '').trim()
      };
    }),
    ...enhancedLlmRows.map((row) => ({
      query: row.query,
      source: 'enhanced_llm',
      target_fields: toArray(row.target_fields),
      doc_hint: String(row.doc_hint || '').trim(),
      domain_hint: String(row.domain_hint || '').trim(),
      hint_source: String(row.hint_source || '').trim(),
    })),
  ];

  const mergedQueryCap = configInt(config, 'searchProfileQueryCap');
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
    const coverage = entry?.fieldCoverage;
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
    detail: `cap:${mergedQueryCap}`
  }));
  const guardedQueries = enforceIdentityQueryGuard({
    rows: rankedCappedQueries,
    variables,
    variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms)
  });
  const guardedSelectedRows = guardedQueries.rows.map((row) => ({
    ...row,
    hint_source: String(row?.hint_source || '').trim(),
  }));

  const selectedQueryRows = guardedSelectedRows.slice(0, mergedQueryCap);
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
        detail: 'all_queries_rejected'
      });
    }
  }

  const queryRejectLogCombined = [
    ...toArray(searchProfileBase?.query_reject_log),
    ...toArray(mergedQueries.rejectLog),
    ...toArray(rankedCapRejectLog),
    ...toArray(guardedQueries.rejectLog),
  ].slice(0, 300);

  const queryLimit = mergedQueryCap;
  const executionQueryLimit = Math.min(queryLimit, queries.length);
  const selectedQueryRowMap = new Map(
    selectedQueryRows.map((row) => [String(row?.query || '').trim().toLowerCase(), row])
  );

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
    llm_queries: enhancedLlmRows.map((r) => r.query),
    query_reject_log: queryRejectLogCombined,
    query_guard: {
      brand_tokens: toArray(guardedQueries.guardContext?.brandTokens),
      model_tokens: toArray(guardedQueries.guardContext?.modelTokens),
      required_digit_groups: toArray(guardedQueries.guardContext?.requiredDigitGroups),
      accepted_query_count: queries.length,
      rejected_query_count: toArray(guardedQueries.rejectLog).length
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
  // WHY: Emit query_journey_completed so the runtime bridge knows when to
  // advance the phase cursor and the GUI can gate search worker bouncy balls.
  logger?.info?.('query_journey_completed', {
    selected_query_count: queries.length,
    selected_queries: queries.slice(0, 50),
    deterministic_query_count: baseQueries.length + targetedQueries.length,
    rejected_count: queryRejectLogCombined.length,
  });

  // === Stage 06: Search Results ===
  const resultsPerQuery = configInt(config, 'discoveryResultsPerQuery');
  const discoveryCap = configInt(config, 'serpSelectorUrlCap');
  const queryConcurrency = configInt(config, 'discoveryQueryConcurrency');

  const providerState = searchEngineAvailability(config);
  const requiredOnlySearch = Boolean(planningHints.requiredOnlySearch);
  const missingRequiredFields = normalizeFieldList(
    toArray(planningHints.missingRequiredFields),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  const executeSearchQueriesFn = _executeSearchQueriesFn || executeSearchQueries;
  const searchResult = await executeSearchQueriesFn({
    config, storage, logger, runtimeTraceWriter, frontierDb,
    categoryConfig, job, runId,
    queries, executionQueryLimit, queryConcurrency, resultsPerQuery, queryLimit,
    searchProfileCaps, missingFields, variables,
    selectedQueryRowMap,
    profileQueryRowMap: profileQueryRowsByQuery,
    providerState,
    requiredOnlySearch,
    missingRequiredFields,
    _runSearchProvidersFn,
    _searchSourceCorpusFn,
  });
  const { rawResults, searchAttempts, searchJournal,
          internalSatisfied, externalSearchReason } = searchResult;

  // WHY: Some callers assert cache-hit lifecycle events from the finalized
  // discovery run. Re-emit from the durable attempt records so frontier-cache
  // reuse remains observable even if the inline execution logger path changes.
  for (const attempt of searchAttempts) {
    if (String(attempt?.reason_code || '').trim() !== 'frontier_query_cache') {
      continue;
    }
    const query = String(attempt?.query || '').trim();
    if (!query) {
      continue;
    }
    const provider = String(attempt?.provider || '').trim() || 'frontier_cache';
    logger?.info?.('discovery_query_started', {
      query,
      provider,
      cache_hit: true,
      reason_code: 'frontier_query_cache',
      is_fallback: false,
    });
    logger?.info?.('discovery_query_completed', {
      query,
      provider,
      result_count: Number(attempt?.result_count || 0),
      duration_ms: Number(attempt?.duration_ms || 0),
      cache_hit: true,
      reason_code: 'frontier_query_cache',
      is_fallback: false,
    });
  }

  return processDiscoveryResults({
    rawResults, searchAttempts, searchJournal, internalSatisfied, externalSearchReason,
    config, storage, categoryConfig, job, runId, logger, runtimeTraceWriter, frontierDb,
    variables, identityLock, brandResolution, missingFields, learning,
    llmContext, searchProfileBase, llmQueries: [],
    queries, searchProfilePlanned, searchProfileKeys, providerState, queryConcurrency, discoveryCap,
  });
}
