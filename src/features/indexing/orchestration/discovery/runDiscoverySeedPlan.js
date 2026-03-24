// WHY: Thin sequential orchestrator for the 8-stage prefetch pipeline.
// Each stage is an explicit named function with clear inputs/outputs.
// Stage ordering: NeedSet → Brand → SearchProfile → SearchPlanner →
// QueryJourney → SearchExecution → ResultProcessing → DomainClassifier

import { loadEnabledSourceEntries } from '../shared/runProductOrchestrationHelpers.js';
import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { computeNeedSet } from '../../../../indexlab/needsetEngine.js';
import { buildSearchPlanningContext } from '../../../../indexlab/searchPlanningContext.js';
import { buildSearchPlan } from '../../../../indexlab/searchPlanBuilder.js';
import { resolveBrandDomain } from '../../discovery/brandResolver.js';
import { resolveJobIdentity, toArray, normalizeHost } from '../../discovery/discoveryIdentity.js';
import {
  mergeLearningStoreHintsIntoLexicon,
  loadLearningArtifacts,
  resolveSearchProfileCaps,
  ensureCategorySourceLookups,
} from '../../discovery/discoveryHelpers.js';
import { extractRootDomain } from '../../../../utils/common.js';
import { searchEngineAvailability } from '../../search/searchProviders.js';
import { executeSearchQueries } from '../../discovery/discoverySearchExecution.js';
import { processDiscoveryResults } from '../../discovery/discoveryResultProcessor.js';

import { runNeedSet } from '../../discovery/stages/needSet.js';
import { runBrandResolver } from '../../discovery/stages/brandResolver.js';
import { runSearchProfile } from '../../discovery/stages/searchProfile.js';
import { runSearchPlanner } from '../../discovery/stages/searchPlanner.js';
import { runQueryJourney } from '../../discovery/stages/queryJourney.js';
import { runDomainClassifier } from '../../discovery/stages/domainClassifier.js';
import { validatePipelineCheckpoint } from '../../discovery/pipelineContextSchema.js';

function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`runDiscoverySeedPlan requires ${name}`);
  }
}

function normalizePlanningHints({
  roundContext,
  requiredFields,
  categoryConfig,
  normalizeFieldListFn,
} = {}) {
  const fieldOrder = categoryConfig?.fieldOrder || [];
  const missingRequiredFields = normalizeFieldListFn(
    roundContext?.missing_required_fields || requiredFields || [],
    { fieldOrder },
  );
  const missingCriticalFields = normalizeFieldListFn(
    roundContext?.missing_critical_fields || categoryConfig?.schema?.critical_fields || [],
    { fieldOrder },
  );
  return {
    missingRequiredFields,
    missingCriticalFields,
  };
}

export async function runDiscoverySeedPlan({
  config = {},
  runtimeOverrides = {},
  storage,
  category,
  categoryConfig,
  job,
  runId,
  logger,
  roundContext,
  requiredFields,
  llmContext,
  frontierDb,
  traceWriter,
  learningStoreHints,
  planner,
  normalizeFieldListFn = normalizeFieldList,
  loadEnabledSourceEntriesFn = loadEnabledSourceEntries,
  computeNeedSetFn = computeNeedSet,
  buildSearchPlanningContextFn = buildSearchPlanningContext,
  buildSearchPlanFn = buildSearchPlan,
  resolveBrandDomainFn = resolveBrandDomain,
  // Stage-level DI seams (used by tests)
  runNeedSetFn = runNeedSet,
  runBrandResolverFn = runBrandResolver,
  runSearchProfileFn = runSearchProfile,
  runSearchPlannerFn = runSearchPlanner,
  runQueryJourneyFn = runQueryJourney,
  executeSearchQueriesFn = executeSearchQueries,
  processDiscoveryResultsFn = processDiscoveryResults,
  runDomainClassifierFn = runDomainClassifier,
} = {}) {
  validateFunctionArg('normalizeFieldListFn', normalizeFieldListFn);
  validateFunctionArg('loadEnabledSourceEntriesFn', loadEnabledSourceEntriesFn);

  // WHY: discoveryEnabled is a pipeline invariant — always on.
  const resolvedSearchEngines = config.searchEngines || 'bing,google';
  const discoveryConfig = {
    ...config,
    discoveryEnabled: true,
    searchEngines: resolvedSearchEngines,
  };
  const sourceEntries = await loadEnabledSourceEntriesFn({ config, category });
  const planningHints = normalizePlanningHints({
    roundContext,
    requiredFields,
    categoryConfig,
    normalizeFieldListFn,
  });

  // === Stages 01 + 02: NeedSet and Brand Resolver (parallel) ===
  // WHY: Stages 01 and 02 are completely independent — neither needs the
  // other's output. Firing them in parallel saves wall-clock time equal to
  // the shorter of the two LLM calls.
  const queryExecutionHistory = frontierDb?.buildQueryExecutionHistory?.(job?.productId) || { queries: [] };

  const [needset, brand] = await Promise.all([
    runNeedSetFn({
      config, job, runId, category, categoryConfig, roundContext, llmContext, logger,
      queryExecutionHistory,
      computeNeedSetFn, buildSearchPlanningContextFn, buildSearchPlanFn,
    }),
    runBrandResolverFn({
      job, category, config, storage, logger, categoryConfig,
      resolveBrandDomainFn,
    }),
  ]);

  // WHY: Add brand-resolved domain to categoryConfig so downstream stages
  // (host policy, query builder) recognise it as an approved source.
  if (brand.brandResolution?.officialDomain) {
    categoryConfig = ensureCategorySourceLookups(categoryConfig);
    const official = normalizeHost(brand.brandResolution.officialDomain);
    if (official && !categoryConfig.sourceHostMap.has(official)) {
      const entry = {
        host: official,
        tierName: 'manufacturer',
        sourceId: `brand_${official.replace(/[^a-z0-9]/g, '_')}`,
        displayName: `${brand.brandResolution.officialDomain} Official`,
        crawlConfig: {
          method: 'http',
          rate_limit_ms: configInt(discoveryConfig, 'manufacturerCrawlRateLimitMs'),
          timeout_ms: configInt(discoveryConfig, 'manufacturerCrawlTimeoutMs'),
          robots_txt_compliant: true,
        },
        fieldCoverage: null,
        robotsTxtCompliant: true,
        baseUrl: `https://${official}`,
      };
      categoryConfig.sourceHosts.push(entry);
      categoryConfig.sourceHostMap.set(official, entry);
      categoryConfig.approvedRootDomains?.add?.(extractRootDomain(official));
    }
  }

  // Resolve identity + missing fields for downstream stages
  const resolvedIdentity = resolveJobIdentity(job);
  const variables = {
    brand: resolvedIdentity.brand,
    model: resolvedIdentity.model,
    variant: resolvedIdentity.variant,
    category: job?.category || categoryConfig?.category,
  };
  const missingFields = normalizeFieldListFn([
    ...toArray(planningHints.missingRequiredFields),
    ...toArray(planningHints.missingCriticalFields),
    ...toArray(job?.requirements?.focus_fields || job?.requirements?.llmTargetFields),
  ], {
    fieldOrder: categoryConfig?.fieldOrder || [],
  });

  const learning = await loadLearningArtifacts({
    storage,
    category: categoryConfig?.category,
  });
  const enrichedLexicon = mergeLearningStoreHintsIntoLexicon(learning.lexicon, learningStoreHints);
  const searchProfileCaps = resolveSearchProfileCaps(config);
  const identityLock = {
    brand: resolvedIdentity.brand,
    model: resolvedIdentity.model,
    variant: resolvedIdentity.variant,
    productId: job?.productId || '',
  };

  // === Pipeline context: accumulate after bootstrap ===
  let ctx = {
    config: discoveryConfig, job, category, categoryConfig, runId,
    focusGroups: needset.focusGroups,
    seedStatus: needset.seedStatus,
    seedSearchPlan: needset.seedSearchPlan,
    brandResolution: brand.brandResolution,
    variables, identityLock, missingFields,
    learning, enrichedLexicon, searchProfileCaps,
    planningHints, queryExecutionHistory,
  };
  validatePipelineCheckpoint('afterBootstrap', ctx, logger, discoveryConfig);

  // === Stage 03: Search Profile ===
  const profile = runSearchProfileFn({
    job, categoryConfig, missingFields,
    learning: { ...learning, enrichedLexicon },
    brandResolution: brand.brandResolution,
    config: discoveryConfig, searchProfileCaps, variables,
    focusGroups: needset.focusGroups,
    seedStatus: needset.seedStatus,
    logger, runId,
  });

  ctx = { ...ctx, ...profile };
  validatePipelineCheckpoint('afterProfile', ctx, logger, discoveryConfig);

  // === Stage 04: Search Planner ===
  const plannerResult = await runSearchPlannerFn({
    searchProfileBase: profile.searchProfileBase,
    queryExecutionHistory,
    config: discoveryConfig, logger, identityLock, missingFields,
  });

  ctx = { ...ctx, enhancedRows: plannerResult.enhancedRows };
  validatePipelineCheckpoint('afterPlanner', ctx, logger, discoveryConfig);

  // === Stage 05: Query Journey ===
  const journey = await runQueryJourneyFn({
    searchProfileBase: profile.searchProfileBase,
    enhancedRows: plannerResult.enhancedRows,
    variables, config: discoveryConfig, searchProfileCaps, missingFields,
    planningHints,
    categoryConfig, job, runId, logger, storage,
    brandResolution: brand.brandResolution,
  });

  ctx = { ...ctx, ...journey };
  validatePipelineCheckpoint('afterJourney', ctx, logger, discoveryConfig);

  // WHY: Emit search_queued events BEFORE Stage 06 starts so the GUI
  // renders all planned workers immediately. Must be in the event stream
  // before any discovery_query_started events fire — the bridge processes
  // events in order, so emitting here guarantees correct slot allocation.
  const plannedQueries = journey.queries.slice(0, journey.executionQueryLimit);
  if (plannedQueries.length > 0) {
    const provider = String(discoveryConfig.searchEngines || '').trim();
    const slotLabels = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < plannedQueries.length && i < slotLabels.length; i++) {
      const letter = slotLabels[i];
      logger?.info?.('search_queued', {
        scope: 'query',
        worker_id: `search-${letter}`,
        slot: letter,
        query: String(plannedQueries[i] || '').trim(),
        provider,
        state: 'queued',
      });
    }
  }

  // === Stage 06: Search Execution ===
  const resultsPerQuery = configInt(discoveryConfig, 'discoveryResultsPerQuery');
  // WHY: discoveryCap derives from serpSelectorUrlCap (a URL count).
  const discoveryCap = configInt(discoveryConfig, 'serpSelectorUrlCap');
  // WHY: Strict sequential execution — search-b must not start until search-a finishes.
  // discoveryQueryConcurrency exists in the registry but is intentionally not used here.
  // Fetch/extraction redesign will handle parallelism with proper Zod schema enforcement.
  const queryConcurrency = 1;
  const providerState = searchEngineAvailability(discoveryConfig);
  const requiredOnlySearch = Boolean(planningHints.requiredOnlySearch);
  const missingRequiredFields = normalizeFieldListFn(
    toArray(planningHints.missingRequiredFields),
    { fieldOrder: categoryConfig?.fieldOrder || [] },
  );

  const searchResult = await executeSearchQueriesFn({
    config: discoveryConfig, storage, logger, runtimeTraceWriter: traceWriter, frontierDb,
    categoryConfig, job, runId,
    queries: journey.queries, executionQueryLimit: journey.executionQueryLimit,
    queryConcurrency, resultsPerQuery, queryLimit: journey.queryLimit,
    searchProfileCaps, missingFields, variables,
    selectedQueryRowMap: journey.selectedQueryRowMap,
    // WHY: Stage 05 exports profileQueryRowsByQuery; Stage 06 expects profileQueryRowMap.
    // Intentional boundary rename — both names are semantically accurate.
    profileQueryRowMap: journey.profileQueryRowsByQuery,
    providerState, requiredOnlySearch, missingRequiredFields,
  });
  const { rawResults, searchAttempts, searchJournal,
    internalSatisfied, externalSearchReason } = searchResult;
  ctx = {
    ...ctx, resultsPerQuery, discoveryCap, queryConcurrency,
    providerState, requiredOnlySearch, missingRequiredFields,
    ...searchResult,
  };
  validatePipelineCheckpoint('afterExecution', ctx, logger, discoveryConfig);

  // === Stage 07: Result Processing ===
  const discoveryResult = await processDiscoveryResultsFn({
    rawResults, searchAttempts, searchJournal, internalSatisfied, externalSearchReason,
    config: discoveryConfig, storage, categoryConfig, job, runId, logger,
    runtimeTraceWriter: traceWriter, frontierDb,
    variables, identityLock, brandResolution: brand.brandResolution,
    missingFields, learning, llmContext,
    searchProfileBase: profile.searchProfileBase,
    llmQueries: [],
    queries: journey.queries, searchProfilePlanned: journey.searchProfilePlanned,
    searchProfileKeys: journey.searchProfileKeys, providerState, queryConcurrency, discoveryCap,
  });

  // === Stage 08: Domain Classifier ===
  const classifierResult = runDomainClassifierFn({
    discoveryResult, planner, config: discoveryConfig, logger,
  });

  // WHY: Build final result as a fresh merge instead of mutating discoveryResult.
  // Stage 08 only reads from discoveryResult (candidates, selectedUrls) — safe to merge after.
  const finalResult = {
    ...discoveryResult,
    ...(needset.seedSearchPlan ? { seed_search_plan_output: needset.seedSearchPlan } : {}),
    enqueue_summary: classifierResult || {},
  };
  ctx = { ...ctx, discoveryResult: finalResult };
  validatePipelineCheckpoint('final', ctx, logger, discoveryConfig);

  return finalResult;
}
