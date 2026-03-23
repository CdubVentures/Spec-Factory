// WHY: Stage 01 of the prefetch pipeline — NeedSet computation.
// Computes needSetOutput → planningContext → searchPlan (LLM call) and emits needset_computed.
// Runs IN PARALLEL with Brand Resolver (Stage 02) via Promise.all.

import { z } from 'zod';
import { computeDeltas } from '../../../../indexlab/searchPlanBuilder.js';

// WHY: Zod input schema validates the stage boundary contract.
// Throws immediately on malformed input so failures are caught at the boundary,
// not deep inside computeNeedSet or buildSearchPlanningContext.
export const needSetInputSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  job: z.object({
    productId: z.string().optional().default(''),
    brand: z.string().optional().default(''),
    model: z.string().optional().default(''),
    baseModel: z.string().optional().default(''),
    aliases: z.array(z.string()).optional().default([]),
    identityLock: z.object({
      brand: z.string().optional().default(''),
      model: z.string().optional().default(''),
      base_model: z.string().optional().default(''),
    }).optional().default({}),
  }).passthrough(),
  runId: z.string().optional().default(''),
  category: z.string().optional().default(''),
  categoryConfig: z.object({
    category: z.string().optional(),
    fieldOrder: z.array(z.string()).optional().default([]),
    fieldRules: z.record(z.string(), z.unknown()).optional().default({}),
    fieldGroups: z.record(z.string(), z.unknown()).optional().default({}),
    sourceHosts: z.array(z.unknown()).optional().default([]),
  }).passthrough(),
  roundContext: z.object({
    provenance: z.record(z.string(), z.unknown()).optional().default({}),
    fieldRules: z.record(z.string(), z.unknown()).optional(),
    fieldReasoning: z.record(z.string(), z.unknown()).optional().default({}),
    constraintAnalysis: z.record(z.string(), z.unknown()).optional().default({}),
    identityContext: z.record(z.string(), z.unknown()).optional().default({}),
    round: z.number().optional().default(0),
    previousFieldHistories: z.record(z.string(), z.unknown()).optional().default({}),
  }).passthrough(),
  llmContext: z.record(z.string(), z.unknown()).optional().default({}),
  logger: z.unknown().optional().default(null),
  queryExecutionHistory: z.object({
    queries: z.array(z.unknown()).optional().default([]),
  }).nullable().optional().default(null),
  computeNeedSetFn: z.custom((v) => typeof v === 'function', { message: 'computeNeedSetFn must be a function' }),
  buildSearchPlanningContextFn: z.custom((v) => typeof v === 'function', { message: 'buildSearchPlanningContextFn must be a function' }),
  buildSearchPlanFn: z.custom((v) => typeof v === 'function', { message: 'buildSearchPlanFn must be a function' }),
}).passthrough();

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
  // 'schema4_computation_failed' (audit finding N1).

  // Step 1: Compute NeedSet (Schema 2)
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

  // Step 2: Build planning context (Schema 3)
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
    scope: 'schema2_preview',
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

  // Step 3: Build search plan (Schema 4)
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
        scope: 'schema4_planner',
        fields: needSetOutput.fields,
        planner_seed: needSetOutput.planner_seed,
      });
    }

    if (searchPlanHandoff?.queries?.length > 0) {
      searchPlanHandoff._planner = searchPlan.planner;
      searchPlanHandoff._learning = searchPlan.learning_writeback;
      searchPlanHandoff._panel = searchPlan.panel;
      logger?.info?.('schema4_handoff_ready', {
        query_count: searchPlanHandoff.queries.length,
        planner_mode: searchPlan?.planner?.mode || 'unknown',
      });
    }
  } catch (err) {
    logger?.warn?.('schema4_computation_failed', {
      error: String(err?.message || 'unknown'),
    });
    searchPlanHandoff = null;
  }

  const focusGroups = planningContext?.focus_groups || [];
  const seedStatus = planningContext?.seed_status || null;

  return { focusGroups, seedStatus, seedSearchPlan };
}
