// Logic Box 3+4: Search planning context → LLM → Search plan (LLM-annotated)
// Calls the planner LLM to generate targeted search queries from focus_groups,
// applies anti-garbage filtering, and assembles the search plan.

import { callLlmWithRouting, hasLlmRouteApiKey, resolvePhaseModel } from '../../../../core/llm/client/routing.js';
import { createSearchPlannerCallLlm, plannerResponseZodSchema } from './searchPlanBuilderLlmAdapter.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { stableHashString } from '../../../../shared/stableHash.js';
import { mapRequiredLevelToBucket } from '../../../../shared/discoveryRankConstants.js';

function defaultQueryHash(query) {
  return stableHashString(String(query || '').trim().toLowerCase().replace(/\s+/g, ' '));
}

// WHY: Re-export so existing consumers don't break.
export { plannerResponseZodSchema } from './searchPlanBuilderLlmAdapter.js';

// --- Core ---


export function computeDeltas(ctx) {
  const currentMap = new Map();
  for (const fg of (ctx.focus_groups || [])) {
    for (const fk of (fg.satisfied_field_keys || [])) currentMap.set(fk, 'satisfied');
    for (const fk of (fg.weak_field_keys || [])) currentMap.set(fk, 'weak');
    for (const fk of (fg.conflict_field_keys || [])) currentMap.set(fk, 'conflict');
    for (const fk of (fg.unresolved_field_keys || [])) {
      if (!currentMap.has(fk)) currentMap.set(fk, 'missing');
    }
  }
  const prev = ctx.previous_round_fields;
  const round = ctx.run?.round ?? 0;
  if (!Array.isArray(prev) || !prev.length) {
    // WHY: Round 0 — show all fields as "new" (first seen, not escalated).
    // Round 1+ with no previous data — return empty. No baseline = no diff.
    if (round > 0) return [];
    return [...currentMap.entries()].map(([field, state]) => ({
      field,
      from: 'none',
      to: state,
    }));
  }
  return prev
    .filter(e => e != null && e.field_key)
    .filter(e => {
      const cur = currentMap.get(e.field_key) || 'missing';
      return cur !== e.state;
    })
    .map(e => ({
      field: e.field_key,
      from: e.state,
      to: currentMap.get(e.field_key) || 'missing',
    }));
}

function makeDisabledResult(ctx) {
  return assembleSearchPlan(ctx, { mode: 'disabled', plannerComplete: true });
}

function makeErrorResult(ctx, error) {
  return assembleSearchPlan(ctx, { mode: 'error', plannerComplete: false, error });
}

function assembleSearchPlan(ctx, {
  mode, plannerComplete, error = null, model = null,
  llmResult = null,
} = {}) {
  // WHY: Budget-aware profile_influence — when tier_allocation exists (from
  // budget-aware NeedSet), show allocated counts. Otherwise fall back to
  // aspirational counts for backward compat.
  const focusGroups = ctx.focus_groups || [];
  const seedStatus = ctx.seed_status || {};
  const alloc = ctx.tier_allocation || null;

  // Totals — always show full inventory regardless of what's allocated
  const allSources = Object.keys(seedStatus?.source_seeds || {});
  const specsSeedNeeded = Boolean(seedStatus?.specs_seed?.is_needed);
  const neededSources = Object.entries(seedStatus?.source_seeds || {})
    .filter(([, s]) => Boolean(s?.is_needed));
  const searchWorthyGroups = focusGroups.filter(g => g.group_search_worthy === true);
  const nonWorthyWithKeys = focusGroups.filter(g =>
    g.group_search_worthy === false &&
    Array.isArray(g.normalized_key_queue) &&
    g.normalized_key_queue.length > 0,
  );
  const aspirationalKeys = nonWorthyWithKeys.reduce((sum, g) => sum + g.normalized_key_queue.length, 0);
  const totalUnresolvedKeys = focusGroups.reduce(
    (sum, g) => sum + (Array.isArray(g.normalized_key_queue) ? g.normalized_key_queue.length : 0), 0,
  );

  const tierInfluence = {
    targeted_brand: alloc
      ? alloc.tier1_seeds.filter(s => s.type === 'brand').length
      : (seedStatus?.brand_seed?.is_needed ? 1 : 0),
    targeted_specification: alloc
      ? alloc.tier1_seeds.filter(s => s.type === 'specs').length
      : (specsSeedNeeded ? 1 : 0),
    targeted_sources: alloc
      ? alloc.tier1_seeds.filter(s => s.type === 'source').length
      : neededSources.length,
    total_sources: allSources.length,
    targeted_groups: alloc ? alloc.tier2_group_count : searchWorthyGroups.length,
    total_groups: focusGroups.length,
    targeted_single: alloc ? alloc.tier3_key_count : aspirationalKeys,
    total_unresolved_keys: totalUnresolvedKeys,
    groups_now: focusGroups.filter(g => g.phase === 'now').length,
    groups_next: focusGroups.filter(g => g.phase === 'next').length,
    groups_hold: focusGroups.filter(g => g.phase === 'hold').length,
    planner_confidence: llmResult?.planner_confidence ?? 0,
    budget: alloc?.budget ?? null,
    allocated: alloc ? (alloc.tier1_seed_count + alloc.tier2_group_count + alloc.tier3_key_count) : null,
    overflow_groups: alloc?.overflow_group_count ?? 0,
    overflow_keys: alloc?.overflow_key_count ?? 0,
  };

  // Group bundles — read from search planning context focus_groups, include display fields
  const bundleMap = new Map();
  for (const fg of (ctx.focus_groups || [])) {
    const gk = fg.key || fg.group_key || '';
    bundleMap.set(gk, {
      key: gk,
      label: fg.label || gk,
      desc: fg.desc || '',
      source_target: fg.source_target || '',
      content_target: fg.content_target || '',
      search_intent: fg.search_intent || null,
      host_class: fg.host_class || null,
      phase: fg.phase,
      priority: fg.priority,
      query_family_mix: null,
      reason_active: null,
      fields: [],
      // Working data — stripped before emit
      _fieldKeys: fg.field_keys || [],
      _satisfied: fg.satisfied_field_keys || [],
      _weak: fg.weak_field_keys || [],
      _conflict: fg.conflict_field_keys || [],
    });
  }
  // Attach LLM per-group metadata
  const llmGroupMap = new Map();
  if (llmResult?.groups) {
    for (const g of llmResult.groups) {
      if (g.key) llmGroupMap.set(g.key, g);
    }
  }
  const fpm = ctx.field_priority_map || {};
  for (const [gk, bundle] of bundleMap) {
    const lg = llmGroupMap.get(gk);
    bundle.query_family_mix = lg?.query_family_mix || null;
    bundle.reason_active = lg?.reason_active || null;

    // Derive fields[] from working data
    const satSet = new Set(bundle._satisfied || []);
    const weakSet = new Set(bundle._weak || []);
    const conflictSet = new Set(bundle._conflict || []);
    bundle.fields = (bundle._fieldKeys || []).map(fk => ({
      key: fk,
      state: satSet.has(fk) ? 'satisfied' : weakSet.has(fk) ? 'weak' : conflictSet.has(fk) ? 'conflict' : 'missing',
      bucket: mapRequiredLevelToBucket(fpm[fk] || 'optional'),
    }));
  }

  // Collect learning writeback — groups_activated from active focus groups
  const groupsSet = new Set();
  for (const [gk] of bundleMap) groupsSet.add(gk);

  return {
    schema_version: 'needset_planner_output.v2',
    run: ctx.run,
    planner: {
      mode,
      model: model || '',
      planner_complete: plannerComplete,
      planner_confidence: llmResult?.planner_confidence ?? 0,
      targeted_exceptions: llmResult?.targeted_exceptions ?? 0,
      error: error ? String(error.message || error) : null,
    },
    search_plan_handoff: {
      queries: [],
      query_hashes: [],
      total: 0,
    },
    panel: {
      round: ctx.run?.round ?? 0,
      identity: ctx.identity,
      summary: ctx.needset?.summary || {},
      blockers: ctx.needset?.blockers || {},
      // WHY: NeedSet panel shows groups/fields only — query authoring belongs
      // to Search Profile + Search Planner stages. Queries still flow via
      // search_plan_handoff for downstream consumption.
      bundles: [...bundleMap.values()].map(b => {
        const { _fieldKeys, _satisfied, _weak, _conflict, ...clean } = b;
        return clean;
      }),
      profile_influence: tierInfluence,
      deltas: computeDeltas(ctx),
    },
    learning_writeback: {
      groups_activated: [...groupsSet].sort(),
    },
  };
}

export async function buildSearchPlan({
  searchPlanningContext,
  config = {},
  logger = null,
  llmContext = {},
  queryHashFn = defaultQueryHash,
} = {}) {
  const ctx = searchPlanningContext || {};
  const identity = ctx.identity || {};
  const run = ctx.run || {};
  const plannerLimits = ctx.planner_limits || {};
  const learning = ctx.learning || {};

  // Guard: disabled
  if (!hasLlmRouteApiKey(config, { role: 'plan' })) {
    return makeDisabledResult(ctx);
  }

  // Pre-LLM anti-garbage: filter groups
  const deadDomains = new Set(Array.isArray(learning.dead_domains) ? learning.dead_domains : []);
  const deadQueryHashes = new Set(Array.isArray(learning.dead_query_hashes) ? learning.dead_query_hashes : []);

  const activeGroups = (ctx.focus_groups || [])
    .filter(g => g.phase === 'now' || g.phase === 'next')
    .map(g => ({
      ...g,
      domain_hints_union: (g.domain_hints_union || []).filter(d => !deadDomains.has(d)),
      existing_queries_union: (g.existing_queries_union || []).filter(q => {
        const h = queryHashFn(q);
        return !deadQueryHashes.has(h);
      }),
    }));

  const activeGroupKeys = activeGroups.map(g => g.key || g.group_key);

  // Build LLM payload — GAP-2: send ALL anti-garbage signals, GAP-12: send weak/conflict
  // WHY: Truncate union arrays to registry-configurable cap to keep the payload
  // small enough for gemini-2.5-flash-lite's output budget.
  const groupCap = configInt(config, 'needsetGroupQueryTermsCap');
  const llmPayload = {
    identity: {
      manufacturer: identity.manufacturer || run.brand || '',
      model: identity.model || run.model || '',
      category: run.category || '',
    },
    round: run.round || 0,
    missing_critical_fields: ctx.needset?.missing_critical_fields || [], // GAP-12
    limits: {
      searchProfileQueryCap: plannerLimits.searchProfileQueryCap || 10,
      domainClassifierUrlCap: plannerLimits.domainClassifierUrlCap || 50,
    },
    focus_groups: activeGroups.map(g => ({
      key: g.key || g.group_key || '',
      phase: g.phase,
      priority: g.priority,
      unresolved_field_keys: g.unresolved_field_keys || [],
      weak_field_keys: g.weak_field_keys || [],
      conflict_field_keys: g.conflict_field_keys || [],
      core_unresolved_count: g.core_unresolved_count || 0,
      secondary_unresolved_count: g.secondary_unresolved_count || 0,
      query_terms_union: (g.query_terms_union || []).slice(0, groupCap),
      domain_hints_union: (g.domain_hints_union || []).slice(0, groupCap),
      existing_queries_union: (g.existing_queries_union || []).slice(0, groupCap),
      aliases_union: (g.aliases_union || []).slice(0, groupCap),
      preferred_content_types_union: (g.preferred_content_types_union || []).slice(0, groupCap),
      domains_tried_union: (g.domains_tried_union || []).slice(0, groupCap),
      host_classes_tried_union: g.host_classes_tried_union || [],
      evidence_classes_tried_union: g.evidence_classes_tried_union || [],
      no_value_attempts: g.no_value_attempts || 0,
      host_class: g.host_class || '',
      source_target: g.source_target || '',
      search_intent: g.search_intent || '',
      urls_examined_count: g.urls_examined_count || 0,
      query_count: g.query_count || 0,
    })),
    existing_queries: ctx.needset?.existing_queries || [],
  };

  const payloadJson = JSON.stringify(llmPayload);

  // Call LLM via adapter
  const callPlanner = createSearchPlannerCallLlm({
    callRoutedLlmFn: callLlmWithRouting, config, logger,
  });

  let llmResult;
  try {
    llmResult = await callPlanner({
      payloadJson,
      llmContext,
      usageContext: {
        category: run.category,
        productId: run.product_id,
        runId: llmContext.runId || run.run_id,
        round: run.round,
        reason: 'needset_search_planner',
        evidence_chars: payloadJson.length,
        trace_context: { purpose: 'needset_search_plan', target_groups: activeGroupKeys },
      },
    });
  } catch (error) {
    logger?.warn?.('search_plan_builder_llm_failed', { message: error.message });
    return makeErrorResult(ctx, error);
  }

  // WHY: NeedSet LLM assesses group priorities only — query authoring belongs
  // to Search Profile (tiers) and Search Planner (LLM).
  return assembleSearchPlan(ctx, { mode: 'llm', plannerComplete: true, model: resolvePhaseModel(config, 'needset'), llmResult });
}
