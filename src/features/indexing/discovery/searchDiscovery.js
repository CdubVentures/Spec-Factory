import { extractRootDomain } from '../../../utils/common.js';
import { planDiscoveryQueriesLLM } from './discoveryPlanner.js';
import { searchProviderAvailability } from '../search/searchProviders.js';
import {
  buildSearchProfile,
  buildScoredQueryRowsFromHostPlan,
  collectHostPlanHintTokens,
} from '../search/queryBuilder.js';
import { normalizeFieldList } from '../../../utils/fieldKeys.js';
import { planUberQueries } from '../../../research/queryPlanner.js';
import { buildEffectiveHostPlan } from './domainHintResolver.js';
import { resolveBrandDomain } from './brandResolver.js';
import { promoteFromBrandResolution } from '../sources/manufacturerPromoter.js';
import { mergeManufacturerPromotions } from '../sources/sourceFileService.js';
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
  resolveSearchProfileCaps,
  resolveEnabledSourceEntries as _resolveEnabledSourceEntries,
} from './discoveryHelpers.js';
import { executeSearchQueries } from './discoverySearchExecution.js';
import { convertHandoffToExecutionPlan } from './searchPlanHandoffAdapter.js';
import { processDiscoveryResults } from './discoveryResultProcessor.js';

// Phase 3 extraction: URL classification, admission gate, doc-kind,
// relevance, sibling detection, forum detection → discoveryUrlClassifier.js

// Backward-compatible re-exports (consumed by test files)
export const computeIdentityMatchLevel = _computeIdentityMatchLevel;
export const detectVariantGuardHit = _detectVariantGuardHit;
export const detectMultiModelHint = _detectMultiModelHint;

// Phase 4A extraction: helpers → discoveryHelpers.js
export const resolveEnabledSourceEntries = _resolveEnabledSourceEntries;

/**
 * Resolve Schema 4 search_plan_handoff into an execution plan, guarded by identity.
 * Returns null when handoff is empty or identity guard rejects all queries.
 * Pure function (except logger side effect).
 */
export function resolveSchema4ExecutionPlan({ searchPlanHandoff, variables, logger } = {}) {
  if (!searchPlanHandoff?.queries?.length) return null;

  const adapted = convertHandoffToExecutionPlan(searchPlanHandoff);
  if (adapted.queries.length === 0) return null;

  const guarded = enforceIdentityQueryGuard({
    rows: adapted.queryRows,
    variables,
  });

  if (guarded.rows.length === 0) {
    logger?.warn?.('schema4_guard_rejected_all', {
      total: adapted.queries.length,
      rejectLog: guarded.rejectLog.slice(0, 10),
    });
    return null;
  }

  return {
    queries: guarded.rows.map((r) => r.query),
    queryRows: guarded.rows,
    selectedQueryRowMap: new Map(guarded.rows.map((r) => [r.query.toLowerCase(), r])),
    rejectLog: guarded.rejectLog,
    guardContext: guarded.guardContext,
    source: 'schema4',
  };
}

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
  searchPlanHandoff = null,
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
      approvedUrls: [],
      candidateUrls: [],
      queries: [],
      llm_queries: [],
      search_profile: null,
      search_profile_key: null,
      search_profile_run_key: null,
      search_profile_latest_key: null
    };
  }

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
  let brandResolution = null;
  let brandStatus = 'skipped';
  let brandSkipReason = '';
  if (!variables.brand) {
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
    confidence: brandResolution?.confidence ?? 0,
    candidates: Array.isArray(brandResolution?.candidates)
      ? brandResolution.candidates.slice(0, 10).map((c) => ({
        name: c?.name || '',
        confidence: c?.confidence ?? 0,
        evidence_snippets: Array.isArray(c?.evidence_snippets) ? c.evidence_snippets.slice(0, 5) : [],
        disambiguation_note: c?.disambiguation_note || ''
      }))
      : [],
    reasoning: Array.isArray(brandResolution?.reasoning) ? brandResolution.reasoning.slice(0, 10) : []
  });

  // WHY: Auto-promote brand-resolved domains into first-class source entries
  // so they pass isApprovedHost() and carry correct crawl config.
  if (config.manufacturerAutoPromote && brandResolution?.officialDomain) {
    const sourcesFileData = categoryConfig.sources || {};
    const promotedMap = promoteFromBrandResolution(brandResolution, {
      sources: categoryConfig.sourceRegistry || {},
      manufacturer_defaults: sourcesFileData.manufacturer_defaults,
      manufacturer_crawl_overrides: sourcesFileData.manufacturer_crawl_overrides,
    }, { brandName: variables.brand });
    if (promotedMap.size > 0) {
      const tempSourcesData = mergeManufacturerPromotions(
        { sources: categoryConfig.sourceRegistry || {}, approved: {} },
        promotedMap
      );
      for (const [host, entry] of promotedMap) {
        const norm = normalizeHost(host);
        if (!categoryConfig.sourceHostMap.has(norm)) {
          const hostEntry = {
            host: norm,
            tierName: 'manufacturer',
            sourceId: entry._sourceId,
            displayName: entry.display_name,
            crawlConfig: entry.crawl_config,
            fieldCoverage: null,
            robotsTxtCompliant: entry.crawl_config?.robots_txt_compliant ?? true,
            baseUrl: entry.base_url,
          };
          categoryConfig.sourceHosts.push(hostEntry);
          categoryConfig.sourceHostMap.set(norm, hostEntry);
          categoryConfig.approvedRootDomains?.add?.(extractRootDomain(norm));
        }
      }
      Object.assign(categoryConfig.sourceRegistry, tempSourcesData.sources);
      logger?.info?.('manufacturer_auto_promoted', {
        promoted_hosts: [...promotedMap.keys()],
        count: promotedMap.size,
      });
    }
  }

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

  // Declare shared variables set by either Schema 4 or old path
  let queries;
  let executionQueryLimit;
  let queryLimit;
  let selectedQueryRowMap;
  let profileQueryRowsByQuery;
  let searchProfilePlanned;
  let llmQueries = [];
  let uberSearchPlan = null;
  let effectiveHostPlan = null;
  let searchProfileBase = null;
  const uberMode = true;

  // === Schema 4 handoff path ===
  const schema4Plan = resolveSchema4ExecutionPlan({
    searchPlanHandoff,
    variables,
    logger,
  });

  // WHY: Schema 4 handoff must meet a minimum query threshold to be useful.
  // If the LLM only generates a few queries (e.g. single group), the old
  // 7-layer path produces better coverage with base templates + LLM planners.
  const SCHEMA4_MIN_QUERIES = 6;
  if (schema4Plan && schema4Plan.queries.length >= SCHEMA4_MIN_QUERIES) {
    queries = schema4Plan.queries;
    queryLimit = queries.length;
    executionQueryLimit = queries.length;
    selectedQueryRowMap = schema4Plan.selectedQueryRowMap;
    profileQueryRowsByQuery = schema4Plan.selectedQueryRowMap;
    searchProfilePlanned = {
      category: categoryConfig.category,
      product_id: job.productId,
      run_id: runId,
      base_model: job.baseModel || '',
      aliases: job.aliases || [],
      generated_at: new Date().toISOString(),
      status: 'planned',
      provider: config.searchProvider,
      source: 'schema4_planner',
      selected_queries: queries,
      selected_query_count: queries.length,
      query_rows: schema4Plan.queryRows,
      query_reject_log: schema4Plan.rejectLog.slice(0, 300),
      query_guard: {
        brand_tokens: toArray(schema4Plan.guardContext?.brandTokens),
        model_tokens: toArray(schema4Plan.guardContext?.modelTokens),
        required_digit_groups: toArray(schema4Plan.guardContext?.requiredDigitGroups),
        accepted_query_count: queries.length,
        rejected_query_count: schema4Plan.rejectLog.length,
      },
      effective_host_plan: null,
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
    logger?.info?.('schema4_path_active', {
      total_handoff: searchPlanHandoff.queries.length,
      post_guard: schema4Plan.queries.length,
      rejected: schema4Plan.rejectLog.length,
    });
    logger?.info?.('search_profile_generated', {
      run_id: runId,
      category: categoryConfig.category,
      product_id: job.productId,
      query_count: queries.length,
      key: searchProfileKeys.inputKey,
      source: 'schema4_planner',
      query_rows: schema4Plan.queryRows.slice(0, 220).map((r) => ({
        query: r.query,
        hint_source: r.hint_source || '',
        target_fields: r.target_fields || [],
        doc_hint: r.doc_hint || '',
        domain_hint: r.domain_hint || '',
      })),
    });
  } else {
  if (schema4Plan && schema4Plan.queries.length < SCHEMA4_MIN_QUERIES) {
    logger?.info?.('schema4_path_insufficient_queries', {
      schema4_count: schema4Plan.queries.length,
      min_required: SCHEMA4_MIN_QUERIES,
      fallback: 'old_path',
    });
  }
  // === OLD PATH: 7-layer append chain ===
  const profileMaxQueries = Math.max(6, Number(config.discoveryMaxQueries || 8) * 2);
  searchProfileBase = buildSearchProfile({
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
  });
  const phase3SearchActive = Boolean(categoryConfig?.validatedRegistry);
  const brandResolutionHints = [...new Set(
    [
      brandResolution?.officialDomain,
      ...toArray(brandResolution?.aliases),
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  )];
  let hostPlanQueryRows = [];
  if (phase3SearchActive) {
    const hostPlanHintTokens = collectHostPlanHintTokens({
      categoryConfig,
      focusFields: missingFields,
    });
    if (hostPlanHintTokens.length > 0) {
      effectiveHostPlan = buildEffectiveHostPlan({
        domainHints: hostPlanHintTokens,
        registry: categoryConfig.validatedRegistry,
        providerName: config.searchProvider,
        brandResolutionHints,
      });
      hostPlanQueryRows = buildScoredQueryRowsFromHostPlan(
        effectiveHostPlan,
        {
          brand: variables.brand,
          model: variables.model,
          variant: variables.variant,
        },
        missingFields
      );
    }
  }
  const baseQueries = toArray(searchProfileBase?.base_templates);
  const targetedQueries = toArray(searchProfileBase?.queries);
  profileQueryRowsByQuery = new Map(
    toArray(searchProfileBase?.query_rows).map((row) => {
      const token = String(row?.query || '').trim().toLowerCase();
      return [token, row];
    })
  );
  const resolveProfileQueryRow = (query) => profileQueryRowsByQuery.get(String(query || '').trim().toLowerCase()) || null;

  // Build compressed archetype context for planner blindness fix
  const archetypeSummary = searchProfileBase?.archetype_summary || {};
  const coverageAnalysis = searchProfileBase?.coverage_analysis || {};
  const archetypeContext = {
    archetypes_emitted: Object.keys(archetypeSummary),
    hosts_targeted: Object.values(archetypeSummary).flatMap((a) => a?.hosts || []),
    uncovered_search_worthy: coverageAnalysis.uncovered_search_worthy || [],
    representative_gaps: (coverageAnalysis.uncovered_search_worthy || []).slice(0, 10)
  };
  const enrichedLlmContext = { ...llmContext, archetypeContext };

  llmQueries = await planDiscoveryQueriesLLM({
    job,
    categoryConfig,
    baseQueries: [...baseQueries, ...targetedQueries],
    missingCriticalFields: planningHints.missingCriticalFields || [],
    config,
    logger,
    llmContext: enrichedLlmContext
  });

  if (toArray(llmQueries).length > 0) {
    logger?.info?.('search_plan_generated', {
      pass_index: 0,
      pass_name: 'primary',
      queries_generated: toArray(llmQueries).map((q) =>
        typeof q === 'object' ? String(q?.query || '').trim() : String(q || '').trim()
      ).filter(Boolean),
      stop_condition: 'planner_complete',
      plan_rationale: `LLM planner generated ${toArray(llmQueries).length} queries for ${toArray(planningHints.missingCriticalFields).length} missing critical fields`,
      query_target_map: toArray(llmQueries).reduce((acc, q) => {
        if (q && typeof q === 'object' && q.query && Array.isArray(q.target_fields) && q.target_fields.length > 0) {
          acc[String(q.query).trim()] = q.target_fields;
        }
        return acc;
      }, {}),
      missing_critical_fields: toArray(planningHints.missingCriticalFields).slice(0, 30),
      mode: String(llmContext?.mode || 'standard'),
    });
  }

  const frontierSummary = frontierDb?.snapshotForProduct?.(job.productId || '') || {};
  uberSearchPlan = uberMode
    ? await planUberQueries({
      config,
      logger,
      llmContext: enrichedLlmContext,
      identity: identityLock,
      missingFields,
      baseQueries: [...baseQueries, ...targetedQueries, ...llmQueries],
      frontierSummary,
      cap: Math.max(8, Number(config.discoveryMaxQueries || 8) * 2)
    })
    : null;

  queryLimit = Math.max(
    1,
    Number(
      uberSearchPlan?.max_queries ||
      config.discoveryMaxQueries ||
      8
    )
  );
  const llmQueryRows = toArray(llmQueries).map((row) => {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return {
        query: String(row.query || '').trim(),
        source: 'llm',
        target_fields: toArray(row.target_fields)
      };
    }
    return { query: String(row || '').trim(), source: 'llm', target_fields: [] };
  });
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
    ...llmQueryRows,
    ...toArray(uberSearchPlan?.queries).map((query) => ({ query, source: 'uber', target_fields: [] }))
  ];
  const mergedQueryCap = Math.max(queryLimit, 6);
  const mergedQueries = dedupeQueryRows(queryCandidates, searchProfileCaps.dedupeQueriesCap);
  const rankedQueries = prioritizeQueryRows(mergedQueries.rows, variables, missingFields);
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
  const legacySelectedRows = guardedQueries.rows.map((row) => ({
    ...row,
    hint_source: String(row?.hint_source || '').trim(),
  }));
  let appendedHostPlanRows = [];
  let hostPlanRejectLog = [];
  if (hostPlanQueryRows.length > 0) {
    const guardedHostPlanRows = enforceIdentityQueryGuard({
      rows: hostPlanQueryRows,
      variables,
      variantGuardTerms: toArray(searchProfileBase?.variant_guard_terms)
    });
    hostPlanRejectLog = guardedHostPlanRows.rejectLog;
    const seenQueries = new Set(
      legacySelectedRows.map((row) => String(row?.query || '').trim().toLowerCase()).filter(Boolean)
    );
    const uniqueHostPlanRows = guardedHostPlanRows.rows.filter((row) => {
      const token = String(row?.query || '').trim().toLowerCase();
      if (!token || seenQueries.has(token)) {
        return false;
      }
      seenQueries.add(token);
      return true;
    });
    const hostPlanExtraCap = Math.max(2, Math.min(8, queryLimit));
    appendedHostPlanRows = uniqueHostPlanRows.slice(0, hostPlanExtraCap);
  }
  const selectedQueryRows = [...legacySelectedRows, ...appendedHostPlanRows];
  queries = selectedQueryRows.map((row) => String(row?.query || '').trim()).filter(Boolean);
  if (!queries.length && rankedCappedQueries.length > 0) {
    const fallback = String(rankedCappedQueries[0]?.query || '').trim();
    if (fallback) {
      queries = [fallback];
      selectedQueryRows.push({
        ...rankedCappedQueries[0],
        query: fallback,
      });
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
    ...toArray(hostPlanRejectLog)
  ].slice(0, 300);
  executionQueryLimit = Math.max(queryLimit, queries.length);
  selectedQueryRowMap = new Map(
    selectedQueryRows.map((row) => [String(row?.query || '').trim().toLowerCase(), row])
  );
  const resolveSelectedQueryRow = (query) => selectedQueryRowMap.get(String(query || '').trim().toLowerCase()) || null;
  searchProfilePlanned = {
    ...searchProfileBase,
    category: categoryConfig.category,
    product_id: job.productId,
    run_id: runId,
    base_model: job.baseModel || '',
    aliases: job.aliases || [],
    generated_at: new Date().toISOString(),
    status: 'planned',
    provider: config.searchProvider,
    llm_queries: llmQueries,
    query_reject_log: queryRejectLogCombined,
    query_guard: {
      brand_tokens: toArray(guardedQueries.guardContext?.brandTokens),
      model_tokens: toArray(guardedQueries.guardContext?.modelTokens),
      required_digit_groups: toArray(guardedQueries.guardContext?.requiredDigitGroups),
      accepted_query_count: queries.length,
      rejected_query_count: toArray(guardedQueries.rejectLog).length + toArray(hostPlanRejectLog).length
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
    schema4_planner: null,
    schema4_learning: null,
    schema4_panel: null,
    key: searchProfileKeys.inputKey,
    run_key: searchProfileKeys.runKey,
    latest_key: searchProfileKeys.latestKey
  };
  await writeSearchProfileArtifacts({
    storage,
    payload: searchProfilePlanned,
    keys: searchProfileKeys
  });
  if (toArray(llmQueries).length === 0 && queries.length > 0) {
    logger?.info?.('search_plan_generated', {
      pass_index: 0,
      pass_name: 'deterministic_fallback',
      queries_generated: queries.slice(0, executionQueryLimit),
      stop_condition: 'deterministic_queries_ready',
      plan_rationale: 'Deterministic search-profile planner generated fallback queries without LLM',
      query_target_map: queries.slice(0, executionQueryLimit).reduce((acc, query) => {
        const row = resolveSelectedQueryRow(query) || resolveProfileQueryRow(query);
        const fields = toArray(row?.target_fields);
        if (fields.length > 0) {
          acc[query] = fields;
        }
        return acc;
      }, {}),
      missing_critical_fields: toArray(planningHints.missingCriticalFields).slice(0, 30),
      mode: 'deterministic'
    });
  }
  logger?.info?.('search_profile_generated', {
    run_id: runId,
    category: categoryConfig.category,
    product_id: job.productId,
    alias_count: toArray(searchProfileBase?.identity_aliases).length,
    query_count: queries.length,
    key: searchProfileKeys.inputKey,
    hint_source_counts: searchProfilePlanned?.hint_source_counts || {},
    source: 'runtime_planner',
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
        warnings: Array.isArray(queryRow?.warnings) ? queryRow.warnings : []
      }))
  });
  } // end old path (else branch)

  // === CONVERGENCE: both Schema 4 and old paths ===
  const resultsPerQuery = Math.max(1, Number(config.discoveryResultsPerQuery || 10));
  const discoveryCap = Math.max(1, Number(config.discoveryMaxDiscovered || 120));
  const queryConcurrency = Math.max(1, Number(config.discoveryQueryConcurrency || 1));

  const providerState = searchProviderAvailability(config);
  const requiredOnlySearch = Boolean(planningHints.requiredOnlySearch);
  const missingRequiredFields = normalizeFieldList(
    toArray(planningHints.missingRequiredFields),
    { fieldOrder: categoryConfig.fieldOrder || [] }
  );
  const searchResult = await executeSearchQueries({
    config, storage, logger, runtimeTraceWriter, frontierDb,
    categoryConfig, job, runId,
    queries, executionQueryLimit, queryConcurrency, resultsPerQuery, queryLimit,
    searchProfileCaps, missingFields, variables,
    selectedQueryRowMap,
    profileQueryRowMap: profileQueryRowsByQuery,
    providerState,
    requiredOnlySearch,
    missingRequiredFields,
  });
  const { rawResults, searchAttempts, searchJournal,
          internalSatisfied, externalSearchReason } = searchResult;

  return processDiscoveryResults({
    rawResults, searchAttempts, searchJournal, internalSatisfied, externalSearchReason,
    config, storage, categoryConfig, job, runId, logger, runtimeTraceWriter, frontierDb,
    variables, identityLock, brandResolution, missingFields, learning,
    llmContext, searchProfileBase, llmQueries, uberSearchPlan, uberMode,
    queries, searchProfilePlanned, searchProfileKeys, providerState, queryConcurrency, discoveryCap,
    effectiveHostPlan,
  });
}
