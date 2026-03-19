// WHY: Stage 01 of the prefetch pipeline — NeedSet computation.
// Computes Schema 2 → 3 → 4 (LLM call) and emits needset_computed.
// The LLM call MUST complete before brand resolver starts so
// needset_computed fires first in the GUI.

import { computeDeltas } from '../../../../indexlab/searchPlanBuilder.js';

/**
 * @param {object} ctx
 * @returns {{ schema2: object, schema3: object, seedSchema4: object|null, searchPlanHandoff: object|null, focusGroups: Array }}
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
  computeNeedSetFn,
  buildSearchPlanningContextFn,
  buildSearchPlanFn,
}) {
  let searchPlanHandoff = null;
  let seedSchema4 = null;
  let schema2 = null;
  let schema3 = null;

  try {
    schema2 = computeNeedSetFn({
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

    const previousRoundFields = Array.isArray(roundContext?.previousRoundFields)
      ? roundContext.previousRoundFields
      : null;

    schema3 = buildSearchPlanningContextFn({
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

    // WHY: Emit pre-LLM preview so the GUI can show blockers, deltas, and
    // field history immediately while the search planner LLM call runs.
    // bundles/profile_influence are empty — they require Schema 4 (LLM).
    logger?.info?.('needset_computed', {
      scope: 'schema2_preview',
      schema_version: 'preview',
      fields: schema2.fields,
      summary: schema2.summary,
      blockers: schema2.blockers,
      planner_seed: schema2.planner_seed,
      total_fields: schema2.total_fields || schema2.fields?.length || 0,
      round: schema2.round,
      round_mode: schema2.round_mode,
      deltas: computeDeltas(schema3),
      bundles: [],
      profile_influence: null,
      rows: [],
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

  const focusGroups = schema3?.focus_groups || [];

  return { schema2, schema3, seedSchema4, searchPlanHandoff, focusGroups };
}
