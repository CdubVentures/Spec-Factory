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
    roundContext, requiredFields, llmContext, frontierDb,
    planner, normalizeFieldListFn,
  } = params;

  const resolvedSearchEngines = config.searchEngines || 'bing,google';
  const discoveryConfig = { ...config, discoveryEnabled: true, searchEngines: resolvedSearchEngines };

  const planningHints = normalizePlanningHints({
    roundContext, requiredFields, categoryConfig, normalizeFieldListFn,
  });

  const queryExecutionHistory = frontierDb?.buildQueryExecutionHistory?.(job?.productId) || { queries: [] };

  return {
    config: discoveryConfig, storage, category, categoryConfig, job, runId, logger,
    roundContext, requiredFields, llmContext, frontierDb,
    planner, normalizeFieldListFn,
    planningHints, queryExecutionHistory,
    // WHY: Auto-collects all function-valued params as DI overrides.
    // Phase descriptors read ctx._di?.keyName || defaultImport.
    // Adding a new injectable requires zero changes here.
    _di: Object.fromEntries(
      Object.entries(params).filter(([, v]) => typeof v === 'function')
    ),
  };
}

export async function runDiscoverySeedPlan(params = {}) {
  validateFunctionArg('normalizeFieldListFn', params.normalizeFieldListFn || normalizeFieldList);
  let ctx = buildInitialContext({ normalizeFieldListFn: normalizeFieldList, ...params });

  for (const phase of PIPELINE_PHASES) {
    const _phaseId = phase.id || (phase.parallel ? phase.parallel.map(p => p.id).join('+') : '?');
    const _pt = Date.now();
    if (phase.parallel) {
      const results = await Promise.all(phase.parallel.map((p) => p.execute(ctx)));
      for (const r of results) ctx = { ...ctx, ...r };
    } else {
      const result = await phase.execute(ctx);
      ctx = { ...ctx, ...result };
    }
    console.error(`[TIMING] phase.${_phaseId}: ${Date.now() - _pt}ms`);
    await ctx.logger?.flush?.();
    if (phase.checkpoint) {
      validatePipelineCheckpoint(phase.checkpoint, ctx, ctx.logger, ctx.config);
    }
  }

  return ctx.finalResult;
}
