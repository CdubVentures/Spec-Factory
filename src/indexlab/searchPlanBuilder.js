// Logic Box 3+4: SearchPlanningContext (Schema 3) → LLM → SearchPlanOutput (Schema 4)
// Calls the planner LLM to generate targeted search queries from focus_groups,
// applies anti-garbage filtering, and assembles Schema 4.

import { callLlmWithRouting, hasLlmRouteApiKey } from '../core/llm/client/routing.js';

// --- Query hashing (same algorithm as frontierDb.js, inlined to avoid coupling) ---

function stableHash(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function defaultQueryHash(query) {
  return stableHash(String(query || '').trim().toLowerCase().replace(/\s+/g, ' '));
}

// --- LLM schema + prompt ---

const PLANNER_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    planner_confidence: { type: 'number' },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          phase: { type: 'string' },
          reason_active: { type: 'string' },
          query_family_mix: { type: 'string' },
          queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                family: { type: 'string' },
                q: { type: 'string' },
                target_fields: { type: 'array', items: { type: 'string' } },
                preferred_domains: { type: 'array', items: { type: 'string' } },
                exact_match_required: { type: 'boolean' },
              },
              required: ['family', 'q'],
            },
          },
        },
        required: ['key', 'queries'],
      },
    },
    duplicates_suppressed: { type: 'integer' },
    targeted_exceptions: { type: 'integer' },
  },
  required: ['groups'],
};

const PLANNER_SYSTEM_PROMPT = [
  'You are a search planner for hardware specification data collection.',
  'Given product identity, focus groups with unresolved fields, anti-garbage signals, and domain hints, generate targeted web search queries.',
  'Rules:',
  '- Generate 1-3 queries per active group, each targeting different search strategies.',
  '- Vary query families: manufacturer_html, manual_pdf, support_docs, review_lookup, benchmark_lookup, fallback_web, targeted_single.',
  '- Prefer manufacturer docs, instrumented lab reviews, and trusted spec databases.',
  '- Avoid junk domains, login pages, forums, and irrelevant topics.',
  '- Do NOT repeat queries from existing_queries — generate DIFFERENT patterns covering new angles.',
  '- Use domains_tried_union to AVOID domains already visited. Target DIFFERENT domains.',
  '- Use host_classes_tried_union to diversify: if "manufacturer" tried, try "review" or "database".',
  '- Use evidence_classes_tried_union to vary content types: if "html" tried, target "pdf" or "json-ld".',
  '- When no_value_attempts is high (3+), radically change search strategy — different terms, domains, angles.',
  '- weak_field_keys need CORROBORATION queries (authoritative sources to confirm). conflict_field_keys need RESOLUTION queries (manufacturer/official sources to settle disagreements).',
  '- Use aliases_union to generate variant-aware queries (e.g., "GPX2" vs "G Pro X Superlight 2").',
  '- Each query must have a "family" (strategy type) and "q" (the search query text).',
  '- Optionally include "target_fields", "preferred_domains", and "exact_match_required".',
  '- Return JSON with a "groups" array where each group has a "key" and "queries" array.',
].join('\n');

const PER_GROUP_CAP = 3;

// --- Core ---

function requiredLevelToBucket(level) {
  if (level === 'identity' || level === 'critical') return 'core';
  if (level === 'required') return 'secondary';
  if (level === 'expected') return 'expected';
  return 'optional';
}

function computeDeltas(ctx) {
  const prev = ctx.previous_round_fields;
  if (!Array.isArray(prev) || !prev.length) return [];
  const currentMap = new Map();
  for (const fg of (ctx.focus_groups || [])) {
    for (const fk of (fg.satisfied_field_keys || [])) currentMap.set(fk, 'satisfied');
    for (const fk of (fg.weak_field_keys || [])) currentMap.set(fk, 'weak');
    for (const fk of (fg.conflict_field_keys || [])) currentMap.set(fk, 'conflict');
    for (const fk of (fg.unresolved_field_keys || [])) {
      if (!currentMap.has(fk)) currentMap.set(fk, 'missing');
    }
  }
  return prev
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

function toInt(value, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function makeDisabledResult(ctx) {
  return assembleSchema4(ctx, [], { mode: 'disabled', plannerComplete: true });
}

function makeErrorResult(ctx, error) {
  return assembleSchema4(ctx, [], { mode: 'error', plannerComplete: false, error });
}

function assembleSchema4(ctx, queries, {
  mode, plannerComplete, error = null, model = null,
  llmResult = null, dupesDropped = 0,
} = {}) {
  const queryHashes = queries.map(q => q.query_hash);

  // Family counts for profile_influence
  const FAMILY_KEYS = ['manufacturer_html', 'manual_pdf', 'support_docs', 'review_lookup', 'benchmark_lookup', 'fallback_web', 'targeted_single'];
  const familyCounts = Object.fromEntries(FAMILY_KEYS.map(k => [k, 0]));
  for (const q of queries) {
    const fam = q.family || 'unknown';
    familyCounts[fam] = (familyCounts[fam] || 0) + 1;
  }

  // Group bundles — read from Schema 3 focus_groups, include display fields
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
      queries: [],
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
  for (const q of queries) {
    const bundle = bundleMap.get(q.group_key);
    if (bundle) {
      bundle.queries.push(q);
    }
  }

  // Attach LLM per-group metadata and project queries to { q, family }
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
    bundle.queries = bundle.queries.map(q => ({ q: q.q, family: q.family }));

    // Derive fields[] from working data
    const satSet = new Set(bundle._satisfied || []);
    const weakSet = new Set(bundle._weak || []);
    const conflictSet = new Set(bundle._conflict || []);
    bundle.fields = (bundle._fieldKeys || []).map(fk => ({
      key: fk,
      state: satSet.has(fk) ? 'satisfied' : weakSet.has(fk) ? 'weak' : conflictSet.has(fk) ? 'conflict' : 'missing',
      bucket: requiredLevelToBucket(fpm[fk] || 'optional'),
    }));
  }

  // Collect learning writeback
  const familiesSet = new Set();
  const domainsSet = new Set();
  const groupsSet = new Set();
  for (const q of queries) {
    if (q.family) familiesSet.add(q.family);
    if (Array.isArray(q.preferred_domains)) {
      for (const d of q.preferred_domains) domainsSet.add(d);
    }
    if (q.group_key) groupsSet.add(q.group_key);
  }

  return {
    schema_version: 'needset_planner_output.v2',
    run: ctx.run,
    planner: {
      mode,
      model: model || '',
      planner_complete: plannerComplete,
      planner_confidence: llmResult?.planner_confidence ?? 0,
      queries_generated: queries.length,
      duplicates_suppressed: dupesDropped,
      targeted_exceptions: llmResult?.targeted_exceptions ?? 0,
      error: error ? String(error.message || error) : null,
    },
    search_plan_handoff: {
      queries,
      query_hashes: queryHashes,
      total: queries.length,
    },
    panel: {
      round: ctx.run?.round ?? 0,
      round_mode: ctx.run?.round_mode || 'seed',
      identity: ctx.identity,
      summary: ctx.needset?.summary || {},
      blockers: ctx.needset?.blockers || {},
      bundles: [...bundleMap.values()].map(b => {
        const { _fieldKeys, _satisfied, _weak, _conflict, ...clean } = b;
        return clean;
      }),
      profile_influence: {
        ...familyCounts,
        duplicates_suppressed: dupesDropped,
        focused_bundles: [...bundleMap.values()].filter(b => b.queries.length > 0).length,
        targeted_exceptions: llmResult?.targeted_exceptions ?? 0,
        total_queries: queries.length,
        trusted_host_share: (familyCounts.manufacturer_html || 0) + (familyCounts.support_docs || 0),
        docs_manual_share: familyCounts.manual_pdf || 0,
      },
      deltas: computeDeltas(ctx),
    },
    learning_writeback: {
      query_hashes_generated: [...queryHashes],
      queries_generated: queries.map(q => q.q),
      families_used: [...familiesSet].sort(),
      domains_targeted: [...domainsSet].sort(),
      groups_activated: [...groupsSet].sort(),
      duplicates_suppressed: dupesDropped,
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
  if (!plannerLimits.phase2LlmEnabled || !hasLlmRouteApiKey(config, { role: 'plan' })) {
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
  const llmPayload = {
    identity: {
      manufacturer: identity.manufacturer || run.brand || '',
      model: identity.model || run.model || '',
      category: run.category || '',
    },
    round: run.round || 0,
    missing_critical_fields: ctx.needset?.missing_critical_fields || [], // GAP-12
    limits: {
      discoveryMaxQueries: plannerLimits.discoveryMaxQueries || 6,
      maxUrlsPerProduct: plannerLimits.maxUrlsPerProduct || 20,
    },
    // WHY: Truncate union arrays to top 5 and drop display-only metrics to keep
    // the payload small enough for gemini-2.5-flash-lite's output budget.
    focus_groups: activeGroups.map(g => ({
      key: g.key || g.group_key || '',
      phase: g.phase,
      priority: g.priority,
      unresolved_field_keys: g.unresolved_field_keys || [],
      weak_field_keys: g.weak_field_keys || [],
      conflict_field_keys: g.conflict_field_keys || [],
      core_unresolved_count: g.core_unresolved_count || 0,
      secondary_unresolved_count: g.secondary_unresolved_count || 0,
      query_terms_union: (g.query_terms_union || []).slice(0, 5),
      domain_hints_union: (g.domain_hints_union || []).slice(0, 5),
      existing_queries_union: (g.existing_queries_union || []).slice(0, 5),
      aliases_union: (g.aliases_union || []).slice(0, 5),
      preferred_content_types_union: (g.preferred_content_types_union || []).slice(0, 5),
      domains_tried_union: (g.domains_tried_union || []).slice(0, 5),
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
  const resolvedModel = String(config.llmModelPlan || config.phase2LlmModel || '');

  // Call LLM
  let llmResult;
  try {
    llmResult = await callLlmWithRouting({
      config,
      reason: 'needset_search_planner',
      role: 'plan',
      system: PLANNER_SYSTEM_PROMPT,
      user: payloadJson,
      jsonSchema: PLANNER_RESPONSE_SCHEMA,
      usageContext: {
        category: run.category,
        productId: run.product_id,
        runId: llmContext.runId || run.run_id,
        round: run.round,
        reason: 'needset_search_planner',
        evidence_chars: payloadJson.length,
        traceWriter: llmContext.traceWriter || null,
        trace_context: { purpose: 'needset_search_plan', target_groups: activeGroupKeys },
      },
      costRates: llmContext.costRates || config,
      onUsage: async (usageRow) => {
        if (typeof llmContext.recordUsage === 'function') await llmContext.recordUsage(usageRow);
      },
      timeoutMs: config.llmTimeoutMs || 40_000,
      logger,
    });
  } catch (error) {
    logger?.warn?.('search_plan_builder_llm_failed', { message: error.message });
    return makeErrorResult(ctx, error);
  }

  // Parse LLM response
  const groups = Array.isArray(llmResult?.groups) ? llmResult.groups : [];
  const globalCap = Math.max(1, toInt(config.discoveryMaxQueries, 6));

  // Post-LLM anti-garbage: extract + dedup + cap
  const existingHashes = new Set();
  for (const eq of (ctx.needset?.existing_queries || [])) {
    existingHashes.add(queryHashFn(eq));
  }

  const allQueries = [];
  const seenHashes = new Set([...existingHashes]);
  const perGroupCount = new Map();
  let dupesDropped = 0;

  for (const group of groups) {
    const groupKey = group.key || '';
    const groupQueries = Array.isArray(group.queries) ? group.queries : [];
    let groupEmitted = perGroupCount.get(groupKey) || 0;

    for (const rawQuery of groupQueries) {
      if (!rawQuery.q || typeof rawQuery.q !== 'string') continue;
      const q = rawQuery.q.trim();
      if (!q) continue;

      const queryHash = queryHashFn(q);
      if (seenHashes.has(queryHash)) { dupesDropped++; continue; }
      if (groupEmitted >= PER_GROUP_CAP) { dupesDropped++; continue; }
      if (allQueries.length >= globalCap) { dupesDropped++; break; }

      seenHashes.add(queryHash);
      groupEmitted++;
      allQueries.push({
        q,
        family: rawQuery.family || 'unknown',
        query_hash: queryHash,
        group_key: groupKey,
        target_fields: Array.isArray(rawQuery.target_fields) ? rawQuery.target_fields : [],
        preferred_domains: Array.isArray(rawQuery.preferred_domains) ? rawQuery.preferred_domains : [],
        exact_match_required: Boolean(rawQuery.exact_match_required),
      });
    }
    perGroupCount.set(groupKey, groupEmitted);

    if (allQueries.length >= globalCap) break;
  }

  return assembleSchema4(ctx, allQueries, { mode: 'llm', plannerComplete: true, model: resolvedModel, llmResult, dupesDropped });
}
