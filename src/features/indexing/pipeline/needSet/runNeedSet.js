// WHY: NeedSet phase of the prefetch pipeline.
// Computes needSetOutput → planningContext → searchPlan (LLM call) and emits needset_computed.
// Runs IN PARALLEL with Brand Resolver phase via Promise.all.

import { computeDeltas } from './searchPlanBuilder.js';

/**
 * @param {object} ctx
 * @returns {{ focusGroups: Array, seedStatus: object|null, seedSearchPlan: object|null }}
 */
export async function runNeedSet({
  config,
  job,
  runId,
  category,
  categoryConfig,
  roundContext,
  llmContext,
  logger,
  queryExecutionHistory = null,
  computeNeedSetFn,
  buildSearchPlanningContextFn,
  buildSearchPlanFn,
}) {

  let searchPlanHandoff = null;
  let seedSearchPlan = null;
  let needSetOutput = null;
  let planningContext = null;

  // WHY: Step-isolated catches so failures are attributed to the correct step.
  // Previously a single try/catch misattributed computeNeedSet failures as
  // 'search_plan_failed' (audit finding N1).

  // Step 1: Compute NeedSet (assessment)
  try {
    needSetOutput = computeNeedSetFn({
      runId,
      category: categoryConfig?.category || category,
      productId: job.productId,
      fieldOrder: categoryConfig?.fieldOrder || [],
      provenance: roundContext?.provenance || {},
      fieldRules: roundContext?.fieldRules || categoryConfig?.fieldRules || {},
      fieldReasoning: roundContext?.fieldReasoning || {},
      constraintAnalysis: roundContext?.constraintAnalysis || {},
      identityContext: roundContext?.identityContext || {},
      round: roundContext?.round || 0,
      brand: job?.brand || job?.identityLock?.brand || '',
      model: job?.model || job?.identityLock?.model || '',
      baseModel: job?.baseModel || job?.identityLock?.base_model || '',
      aliases: job?.aliases || [],
      previousFieldHistories: roundContext?.previousFieldHistories || {},
    });
  } catch (err) {
    logger?.warn?.('needset_computation_failed', {
      error: String(err?.message || 'unknown'),
    });
    return { focusGroups: [], seedStatus: null, seedSearchPlan: null };
  }

  // Step 2: Build planning context
  try {
    const previousRoundFields = Array.isArray(roundContext?.previousRoundFields)
      ? roundContext.previousRoundFields
      : null;

    planningContext = buildSearchPlanningContextFn({
      needSetOutput,
      config,
      fieldGroupsData: categoryConfig?.fieldGroups || {},
      categorySourceHosts: Array.isArray(categoryConfig?.sourceHosts) ? categoryConfig.sourceHosts : [],
      runContext: {
        run_id: runId,
        category: categoryConfig?.category || category,
        product_id: job.productId,
        brand: job?.brand || job?.identityLock?.brand || '',
        model: job?.model || job?.identityLock?.model || '',
        aliases: job?.aliases || [],
        round: roundContext?.round || 0,
      },
      learning: null,
      previousRoundFields,
      queryExecutionHistory,
    });
  } catch (err) {
    logger?.warn?.('search_planning_context_failed', {
      error: String(err?.message || 'unknown'),
    });
    return { focusGroups: [], seedStatus: null, seedSearchPlan: null };
  }

  // WHY: Emit pre-LLM preview so the GUI can show blockers, deltas, and
  // field history immediately while the search planner LLM call runs.
  // bundles/profile_influence are empty — they require the search plan (LLM).
  logger?.info?.('needset_computed', {
    scope: 'needset_assessment',
    schema_version: 'preview',
    fields: needSetOutput.fields,
    summary: needSetOutput.summary,
    blockers: needSetOutput.blockers,
    planner_seed: needSetOutput.planner_seed,
    total_fields: needSetOutput.total_fields || needSetOutput.fields?.length || 0,
    round: needSetOutput.round,
    deltas: computeDeltas(planningContext),
    bundles: [],
    profile_influence: null,
    rows: [],
  });

  // Step 3: Build search plan (LLM-annotated)
  // WHY: The real buildSearchPlan has its own internal catch and should never throw,
  // but we guard defensively for DI stubs and unexpected edge cases.
  try {
    const searchPlan = await buildSearchPlanFn({
      searchPlanningContext: planningContext,
      config,
      logger,
      llmContext,
    });

    seedSearchPlan = searchPlan;
    searchPlanHandoff = searchPlan?.search_plan_handoff || null;

    // WHY: Emit needset_computed with search plan panel data so the runtime bridge
    // picks it up immediately and the prefetch GUI populates live during the run.
    if (searchPlan?.panel) {
      logger?.info?.('needset_computed', {
        ...searchPlan.panel,
        schema_version: searchPlan.schema_version,
        scope: 'search_plan',
        fields: needSetOutput.fields,
        planner_seed: needSetOutput.planner_seed,
      });
    }

    if (searchPlanHandoff?.queries?.length > 0) {
      searchPlanHandoff._planner = searchPlan.planner;
      searchPlanHandoff._learning = searchPlan.learning_writeback;
      searchPlanHandoff._panel = searchPlan.panel;
      logger?.info?.('search_plan_ready', {
        query_count: searchPlanHandoff.queries.length,
        planner_mode: searchPlan?.planner?.mode || 'unknown',
      });
    }
  } catch (err) {
    logger?.warn?.('search_plan_failed', {
      error: String(err?.message || 'unknown'),
    });
    searchPlanHandoff = null;
  }

  const focusGroups = planningContext?.focus_groups || [];
  const seedStatus = planningContext?.seed_status || null;

  return { focusGroups, seedStatus, seedSearchPlan };
}
