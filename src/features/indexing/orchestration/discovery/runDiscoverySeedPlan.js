// WHY: Thin sequential orchestrator for the 8-stage prefetch pipeline.
// Each stage is an explicit named function with clear inputs/outputs.
// Stage ordering: NeedSet → Brand → SearchProfile → SearchPlanner →
// QueryJourney → SearchExecution → ResultProcessing → DomainClassifier

import { loadEnabledSourceEntries } from '../shared/runProductOrchestrationHelpers.js';
import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import { computeNeedSet } from '../../../../indexlab/needsetEngine.js';
import { buildSearchPlanningContext } from '../../../../indexlab/searchPlanningContext.js';
import { buildSearchPlan } from '../../../../indexlab/searchPlanBuilder.js';
import { resolveBrandDomain } from '../../discovery/brandResolver.js';
import { resolveJobIdentity, toArray } from '../../discovery/discoveryIdentity.js';
import {
  mergeLearningStoreHintsIntoLexicon,
  loadLearningArtifacts,
  resolveSearchProfileCaps,
} from '../../discovery/discoveryHelpers.js';
import { searchEngineAvailability } from '../../search/searchProviders.js';
import { executeSearchQueries } from '../../discovery/discoverySearchExecution.js';
import { processDiscoveryResults } from '../../discovery/discoveryResultProcessor.js';

import { runNeedSet } from '../../discovery/stages/needSet.js';
import { runBrandResolver } from '../../discovery/stages/brandResolver.js';
import { runSearchProfile } from '../../discovery/stages/searchProfile.js';
import { runSearchPlanner } from '../../discovery/stages/searchPlanner.js';
import { runQueryJourney } from '../../discovery/stages/queryJourney.js';
import { runDomainClassifier } from '../../discovery/stages/domainClassifier.js';

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
  const bundleHints = Array.isArray(roundContext?.bundle_hints)
    ? roundContext.bundle_hints
    : [];

  return {
    missingRequiredFields,
    missingCriticalFields,
    bundleHints,
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

  // === Stage 01: NeedSet ===
  const needset = await runNeedSetFn({
    config, job, runId, category, categoryConfig, roundContext, llmContext, logger,
    computeNeedSetFn, buildSearchPlanningContextFn, buildSearchPlanFn,
  });

  // === Stage 02: Brand Resolver ===
  const brand = await runBrandResolverFn({
    job, category, config, storage, logger, categoryConfig,
    resolveBrandDomainFn,
  });

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

  // === Stage 03: Search Profile ===
  const profile = runSearchProfileFn({
    job, categoryConfig, missingFields,
    learning: { ...learning, enrichedLexicon },
    brandResolution: brand.brandResolution,
    config: discoveryConfig, searchProfileCaps, variables,
    focusGroups: needset.focusGroups,
    seedStatus: needset.schema3?.seed_status || null,
  });

  // === Stage 04: Search Planner ===
  const baseQueries = toArray(profile.searchProfileBase?.base_templates);
  const plannerResult = await runSearchPlannerFn({
    searchPlanHandoff: needset.searchPlanHandoff,
    searchProfileBase: profile.searchProfileBase,
    variables, config: discoveryConfig, logger, llmContext, identityLock,
    missingFields, planningHints, baseQueries, frontierDb, job,
  });

  // === Stage 05: Query Journey ===
  const journey = await runQueryJourneyFn({
    searchProfileBase: profile.searchProfileBase,
    schema4Plan: plannerResult.schema4Plan,
    uberSearchPlan: plannerResult.uberSearchPlan,
    hostPlanQueryRows: profile.hostPlanQueryRows,
    variables, config: discoveryConfig, searchProfileCaps, missingFields,
    planningHints, effectiveHostPlan: profile.effectiveHostPlan,
    categoryConfig, job, runId, logger, storage,
    brandResolution: brand.brandResolution,
    searchPlanHandoff: needset.searchPlanHandoff,
  });

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
  const resultsPerQuery = Math.max(1, Number(discoveryConfig.discoveryResultsPerQuery || 10));
  const discoveryCap = Math.max(1, Number(discoveryConfig.searchPlannerQueryCap || 30));
  // WHY: Strict sequential execution — search-b must not start until search-a finishes.
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
    profileQueryRowMap: journey.profileQueryRowsByQuery,
    providerState, requiredOnlySearch, missingRequiredFields,
  });
  const { rawResults, searchAttempts, searchJournal,
    internalSatisfied, externalSearchReason } = searchResult;

  // === Stage 07: Result Processing ===
  const discoveryResult = await processDiscoveryResultsFn({
    rawResults, searchAttempts, searchJournal, internalSatisfied, externalSearchReason,
    config: discoveryConfig, storage, categoryConfig, job, runId, logger,
    runtimeTraceWriter: traceWriter, frontierDb,
    variables, identityLock, brandResolution: brand.brandResolution,
    missingFields, learning, llmContext,
    searchProfileBase: profile.searchProfileBase,
    llmQueries: [], uberSearchPlan: plannerResult.uberSearchPlan, uberMode: true,
    queries: journey.queries, searchProfilePlanned: journey.searchProfilePlanned,
    searchProfileKeys: journey.searchProfileKeys, providerState, queryConcurrency, discoveryCap,
    effectiveHostPlan: profile.effectiveHostPlan, focusGroups: needset.focusGroups,
  });

  // WHY: Attach the seed-phase schema4 so finalization can reuse it.
  if (needset.seedSchema4) {
    discoveryResult.seed_search_plan_output = needset.seedSchema4;
  }

  // === Stage 08: Domain Classifier ===
  runDomainClassifierFn({
    discoveryResult, planner, config: discoveryConfig, logger,
  });

  return discoveryResult;
}
