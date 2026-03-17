import { loadEnabledSourceEntries } from '../shared/runProductOrchestrationHelpers.js';
import { discoverCandidateSources } from '../../discovery/searchDiscovery.js';
import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import { computeNeedSet } from '../../../../indexlab/needsetEngine.js';
import { buildSearchPlanningContext } from '../../../../indexlab/searchPlanningContext.js';
import { buildSearchPlan } from '../../../../indexlab/searchPlanBuilder.js';

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
  discoverCandidateSourcesFn = discoverCandidateSources,
  computeNeedSetFn = computeNeedSet,
  buildSearchPlanningContextFn = buildSearchPlanningContext,
  buildSearchPlanFn = buildSearchPlan,
} = {}) {
  validateFunctionArg('normalizeFieldListFn', normalizeFieldListFn);
  validateFunctionArg('loadEnabledSourceEntriesFn', loadEnabledSourceEntriesFn);
  validateFunctionArg('discoverCandidateSourcesFn', discoverCandidateSourcesFn);

  // WHY: discoveryEnabled is a pipeline invariant — always on.
  // No external surface (GUI, API, CLI, persisted settings) should disable it.
  // roundConfigBuilder sets searchProvider='none' for round 0 — recover the real provider.
  const resolvedSearchProvider = (config.searchProvider && config.searchProvider !== 'none')
    ? config.searchProvider
    : 'dual';
  const discoveryConfig = {
    ...config,
    discoveryEnabled: true,
    searchProvider: resolvedSearchProvider,
  };
  const sourceEntries = await loadEnabledSourceEntriesFn({ config, category });
  const planningHints = normalizePlanningHints({
    roundContext,
    requiredFields,
    categoryConfig,
    normalizeFieldListFn,
  });

  // WHY: Compute Schema 2→3→4 BEFORE discovery so the search_plan_handoff
  // is available as input to discoverCandidateSources (Schema 4 path).
  let searchPlanHandoff = null;
  let seedSchema4 = null;
  if (config.enableSchema4SearchPlan) {
    try {
      const schema2 = computeNeedSetFn({
        runId,
        category: categoryConfig?.category || category,
        productId: job?.productId || '',
        fieldOrder: categoryConfig?.fieldOrder || [],
        provenance: roundContext?.provenance || {},
        fieldRules: roundContext?.fieldRules || categoryConfig?.fieldRules || {},
        fieldReasoning: roundContext?.fieldReasoning || {},
        constraintAnalysis: roundContext?.constraintAnalysis || {},
        identityContext: roundContext?.identityContext || {},
        round: roundContext?.round || 0,
        roundMode: roundContext?.round_mode || 'seed',
        brand: job?.brand || job?.identityLock?.brand || '',
        model: job?.model || job?.identityLock?.model || '',
        baseModel: job?.baseModel || job?.identityLock?.base_model || '',
        aliases: job?.aliases || [],
        settings: config,
        previousFieldHistories: roundContext?.previousFieldHistories || {},
      });

      // WHY: Pass previous round field states so computeDeltas can compute
      // "what changed this round" for the GUI needset panel.
      const previousRoundFields = Array.isArray(roundContext?.previousRoundFields)
        ? roundContext.previousRoundFields
        : null;

      const schema3 = buildSearchPlanningContextFn({
        needSetOutput: schema2,
        config,
        fieldGroupsData: categoryConfig?.fieldGroups || {},
        runContext: {
          run_id: runId,
          category: categoryConfig?.category || category,
          product_id: job?.productId || '',
          brand: job?.brand || job?.identityLock?.brand || '',
          model: job?.model || job?.identityLock?.model || '',
          aliases: job?.aliases || [],
          round: roundContext?.round || 0,
          round_mode: roundContext?.round_mode || 'seed',
        },
        learning: null,
        previousRoundFields,
      });

      const schema4 = await buildSearchPlanFn({
        searchPlanningContext: schema3,
        config,
        logger,
        llmContext,
      });

      seedSchema4 = schema4;
      searchPlanHandoff = schema4?.search_plan_handoff || null;

      // WHY: Emit needset_computed with Schema 4 panel data so the runtime bridge
      // picks it up immediately and the prefetch GUI populates live during the run.
      if (schema4?.panel) {
        logger?.info?.('needset_computed', {
          ...schema4.panel,
          schema_version: schema4.schema_version,
          scope: 'schema4_planner',
          fields: schema2.fields,
          planner_seed: schema2.planner_seed,
        });
      }

      if (searchPlanHandoff?.queries?.length > 0) {
        // WHY: Attach planner/learning/panel metadata so searchDiscovery can
        // thread them into searchProfilePlanned for downstream review/learning.
        searchPlanHandoff._planner = schema4.planner;
        searchPlanHandoff._learning = schema4.learning_writeback;
        searchPlanHandoff._panel = schema4.panel;
        logger?.info?.('schema4_handoff_ready', {
          query_count: searchPlanHandoff.queries.length,
          planner_mode: schema4?.planner?.mode || 'unknown',
        });
      }
    } catch (err) {
      logger?.warn?.('schema4_computation_failed', {
        error: String(err?.message || 'unknown'),
      });
      searchPlanHandoff = null;
    }
  }

  const discoveryResult = await discoverCandidateSourcesFn({
    config: discoveryConfig,
    storage,
    categoryConfig,
    job,
    runId,
    logger,
    planningHints,
    llmContext,
    frontierDb,
    runtimeTraceWriter: traceWriter,
    learningStoreHints,
    sourceEntries,
    searchPlanHandoff,
  });

  // WHY: Attach the seed-phase schema4 so finalization can reuse it
  // instead of re-calling the LLM. The needset planner fires once at run start.
  if (seedSchema4) {
    discoveryResult.seed_search_plan_output = seedSchema4;
  }

  for (const url of discoveryResult.approvedUrls || []) {
    planner.enqueue(url, 'discovery_approved', { forceApproved: true, forceBrandBypass: false });
  }
  if (discoveryResult.enabled && config.maxCandidateUrls > 0 && config.fetchCandidateSources) {
    planner.seedCandidates(discoveryResult.candidateUrls || []);
  }

  if (planner.enqueueCounters) {
    logger?.info?.('discovery_enqueue_summary', planner.enqueueCounters);
  }

  return discoveryResult;
}
