import { loadEnabledSourceEntries } from '../shared/runProductOrchestrationHelpers.js';
import { discoverCandidateSources } from '../../discovery/searchDiscovery.js';
import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import { computeNeedSet } from '../../../../indexlab/needsetEngine.js';
import { buildSearchPlanningContext } from '../../../../indexlab/searchPlanningContext.js';
import { buildSearchPlan } from '../../../../indexlab/searchPlanBuilder.js';
import { canonicalizeQueueUrl } from '../../../../planner/sourcePlannerUrlUtils.js';

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
  // roundConfigBuilder sets searchEngines='' for round 0 — recover the real engines.
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

  // WHY: Compute Schema 2→3→4 BEFORE discovery so the search_plan_handoff
  // is available as input to discoverCandidateSources (Schema 4 path).
  let searchPlanHandoff = null;
  let seedSchema4 = null;
  let schema3 = null;
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

  // WHY: focusGroups from Schema 3 carry NeedSet pressure signals
  // (core_unresolved_count per field group) needed by lane-quota selection
  // and surface-aware scoring in the triage pipeline.
  const focusGroups = schema3?.focus_groups || [];

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
    focusGroups,
  });

  // WHY: Attach the seed-phase schema4 so finalization can reuse it
  // instead of re-calling the LLM. The needset planner fires once at run start.
  if (seedSchema4) {
    discoveryResult.seed_search_plan_output = seedSchema4;
  }

  // WHY: Build triage metadata map keyed by canonical URL so planner.enqueue()
  // can look up triage labels. Canonical key matches planner dedup normalization.
  const triageMetaMap = new Map();
  for (const candidate of discoveryResult.candidates || []) {
    let canonical;
    try {
      canonical = canonicalizeQueueUrl(new URL(candidate.url));
    } catch {
      continue;
    }
    triageMetaMap.set(canonical, {
      raw_url: candidate.original_url || candidate.url,
      normalized_url: candidate.url,
      canonical_url: canonical,
      identity_prelim: candidate.identity_prelim || null,
      host_trust_class: candidate.host_trust_class || null,
      doc_kind_guess: candidate.doc_kind_guess || null,
      extraction_surface_prior: candidate.extraction_surface_prior || null,
      primary_lane: candidate.primary_lane || null,
      triage_disposition: candidate.triage_disposition || null,
      approval_bucket: candidate.approval_bucket || null,
      // WHY: prefer explicit Stage 06 selection_priority if present;
      // derive from triage_disposition only as fallback.
      selection_priority: candidate.selection_priority
        || (candidate.triage_disposition === 'fetch_high' ? 'high'
          : candidate.triage_disposition === 'fetch_normal' ? 'medium'
          : candidate.triage_disposition === 'fetch_low' ? 'low'
          : 'low'),
      soft_reason_codes: candidate.soft_reason_codes || null,
      triage_score: candidate.score ?? candidate.triage_score ?? 0,
      query_family: candidate.query_family || null,
      target_fields: candidate.target_fields || null,
      hint_source: candidate.hint_source || null,
      doc_hint: candidate.doc_hint || null,
      domain_hint: candidate.domain_hint || null,
      providers: candidate.providers || null,
    });
  }

  for (const url of discoveryResult.approvedUrls || []) {
    const meta = triageMetaMap.size > 0 ? _lookupTriageMeta(url, triageMetaMap) : null;
    planner.enqueue(url, 'discovery_approved', { forceApproved: true, forceBrandBypass: false, triageMeta: meta });
  }
  if (discoveryResult.enabled && config.maxCandidateUrls > 0 && config.fetchCandidateSources) {
    planner.seedCandidates(discoveryResult.candidateUrls || [], { triageMetaMap });
  }

  if (planner.enqueueCounters) {
    const counters = planner.enqueueCounters;
    logger?.info?.('discovery_enqueue_summary', {
      ...counters,
      input_approved_count: (discoveryResult.approvedUrls || []).length,
      input_candidate_count: (discoveryResult.candidateUrls || []).length,
    });
  }

  return discoveryResult;
}

function _lookupTriageMeta(url, triageMetaMap) {
  if (!triageMetaMap || triageMetaMap.size === 0) return null;
  try {
    const parsed = new URL(url);
    const canonical = canonicalizeQueueUrl(parsed);
    if (triageMetaMap.has(canonical)) return triageMetaMap.get(canonical);
    const normalized = parsed.toString();
    if (triageMetaMap.has(normalized)) return triageMetaMap.get(normalized);
  } catch {
    // Fall through
  }
  if (triageMetaMap.has(url)) return triageMetaMap.get(url);
  return null;
}
