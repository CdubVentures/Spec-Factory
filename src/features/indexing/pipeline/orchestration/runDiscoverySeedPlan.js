// WHY: Registry-driven orchestrator for the prefetch pipeline.
// Zero domain knowledge — phases declare their own wiring in phaseDescriptor.js.
// Adding a phase = create phaseDescriptor.js in phase folder + add entry to registry.

import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import { PIPELINE_PHASES } from './pipelinePhaseRegistry.js';
import { validatePipelineCheckpoint } from './pipelineContextSchema.js';

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
  return { missingRequiredFields, missingCriticalFields };
}

function buildInitialContext(params) {
  const {
    config = {}, storage, category, categoryConfig, job, runId, logger,
    roundContext, requiredFields, llmContext, frontierDb, traceWriter,
    learningStoreHints, planner, normalizeFieldListFn,
  } = params;

  const resolvedSearchEngines = config.searchEngines || 'bing,google';
  const discoveryConfig = { ...config, discoveryEnabled: true, searchEngines: resolvedSearchEngines };

  const planningHints = normalizePlanningHints({
    roundContext, requiredFields, categoryConfig, normalizeFieldListFn,
  });

  const queryExecutionHistory = frontierDb?.buildQueryExecutionHistory?.(job?.productId) || { queries: [] };

  return {
    config: discoveryConfig, storage, category, categoryConfig, job, runId, logger,
    roundContext, requiredFields, llmContext, frontierDb, traceWriter,
    learningStoreHints, planner, normalizeFieldListFn,
    planningHints, queryExecutionHistory,
    _di: {
      runNeedSetFn: params.runNeedSetFn,
      runBrandResolverFn: params.runBrandResolverFn,
      runSearchProfileFn: params.runSearchProfileFn,
      runSearchPlannerFn: params.runSearchPlannerFn,
      runQueryJourneyFn: params.runQueryJourneyFn,
      executeSearchQueriesFn: params.executeSearchQueriesFn,
      processDiscoveryResultsFn: params.processDiscoveryResultsFn,
      runDomainClassifierFn: params.runDomainClassifierFn,
      computeNeedSetFn: params.computeNeedSetFn,
      buildSearchPlanningContextFn: params.buildSearchPlanningContextFn,
      buildSearchPlanFn: params.buildSearchPlanFn,
      resolveBrandDomainFn: params.resolveBrandDomainFn,
    },
  };
}

export async function runDiscoverySeedPlan(params = {}) {
  validateFunctionArg('normalizeFieldListFn', params.normalizeFieldListFn || normalizeFieldList);
  let ctx = buildInitialContext({ normalizeFieldListFn: normalizeFieldList, ...params });

  for (const phase of PIPELINE_PHASES) {
    if (phase.parallel) {
      const results = await Promise.all(phase.parallel.map((p) => p.execute(ctx)));
      for (const r of results) ctx = { ...ctx, ...r };
    } else {
      const result = await phase.execute(ctx);
      ctx = { ...ctx, ...result };
    }
    await ctx.logger?.flush?.();
    if (phase.checkpoint) {
      validatePipelineCheckpoint(phase.checkpoint, ctx, ctx.logger, ctx.config);
    }
  }

  return ctx.finalResult;
}
