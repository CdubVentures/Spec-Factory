import fs from 'node:fs';
import path from 'node:path';

import { loadCategoryConfig } from '../../categories/loader.js';
import {
  readLearningHintsFromStores,
  UrlMemoryStore,
  DomainFieldYieldStore,
  FieldAnchorsStore,
  ComponentLexiconStore,
  collectLearningSeeds,
  loadLearningProfile,
} from '../../features/indexing/learning/index.js';
import {
  buildIndexlabRuntimeCategoryConfig,
  loadRouteMatrixPolicyForRun,
  stableHash,
} from '../../features/indexing/orchestration/shared/index.js';
import {
  createRunLlmRuntime,
  loadLearningStoreHintsForRun,
} from '../../features/indexing/orchestration/bootstrap/index.js';
import {
  buildDiscoverySeedPlanContext,
  runDiscoverySeedPlan,
} from '../../features/indexing/pipeline/orchestration/index.js';
import { buildOrderedFetchPlan } from '../../features/indexing/pipeline/domainClassifier/runDomainClassifier.js';
// WHY: Adapter subsystem removed — baseline LLM extraction handles all sources.
// No-op factory preserves DI shape while adapters are retired.
function createNoOpAdapterManager() {
  return {
    collectSeedUrls: () => [],
    extractForPage: async () => ({}),
    runDedicatedAdapters: async () => ({ syntheticSources: [], adapterArtifacts: [] }),
  };
}
import { loadSourceIntel } from '../../intel/sourceIntel.js';
import { readBillingSnapshot } from '../../billing/costLedger.js';
import { defaultIndexLabRoot } from '../../core/config/runtimeArtifactRoots.js';
import { normalizeCostRates } from '../../billing/costRates.js';
import { normalizeFieldList } from '../../utils/fieldKeys.js';
import { computeNeedSet } from '../../features/indexing/pipeline/needSet/needsetEngine.js';
import { recordPromptResult } from '../../features/indexing/pipeline/shared/index.js';
import { appendCostLedgerEntry } from '../../billing/costLedger.js';

const DEFAULT_DEPS = {
  loadCategoryConfigFn: loadCategoryConfig,
  buildIndexlabRuntimeCategoryConfigFn: buildIndexlabRuntimeCategoryConfig,
  loadRouteMatrixPolicyForRunFn: loadRouteMatrixPolicyForRun,
  createAdapterManagerFn: createNoOpAdapterManager,
  loadSourceIntelFn: loadSourceIntel,
  loadLearningProfileFn: loadLearningProfile,
  collectLearningSeedsFn: collectLearningSeeds,
  readBillingSnapshotFn: readBillingSnapshot,
  createRunLlmRuntimeFn: createRunLlmRuntime,
  normalizeCostRatesFn: normalizeCostRates,
  appendCostLedgerEntryFn: appendCostLedgerEntry,
  recordPromptResultFn: recordPromptResult,
  defaultIndexLabRootFn: defaultIndexLabRoot,
  joinPathFn: path.join,
  mkdirSyncFn: fs.mkdirSync,
  loadLearningStoreHintsForRunFn: loadLearningStoreHintsForRun,
  UrlMemoryStoreClass: UrlMemoryStore,
  DomainFieldYieldStoreClass: DomainFieldYieldStore,
  FieldAnchorsStoreClass: FieldAnchorsStore,
  ComponentLexiconStoreClass: ComponentLexiconStore,
  normalizeFieldListFn: normalizeFieldList,
  readLearningHintsFromStoresFn: readLearningHintsFromStores,
  computeNeedSetFn: computeNeedSet,
  buildDiscoverySeedPlanContextFn: buildDiscoverySeedPlanContext,
  runDiscoverySeedPlanFn: runDiscoverySeedPlan,
  buildOrderedFetchPlanFn: buildOrderedFetchPlan,
};

export async function bootstrapRunProductExecutionState({
  storage,
  config,
  logger,
  category,
  productId,
  runId,
  roundContext,
  runtimeMode,
  job,
  identityLock,
  identityLockStatus,
  runArtifactsBase,
  traceWriter,
  syncRuntimeOverrides,
  frontierDb,
  deps = {},
} = {}) {
  const runtimeDeps = { ...DEFAULT_DEPS, ...deps };

  logger.info('bootstrap_step', { step: 'config', progress: 0 });
  const authoringCategoryConfig = await runtimeDeps.loadCategoryConfigFn(category, { storage, config });
  const categoryConfig = runtimeDeps.buildIndexlabRuntimeCategoryConfigFn(authoringCategoryConfig);

  logger.info('bootstrap_step', { step: 'storage', progress: 15 });
  const routeMatrixPolicy = await runtimeDeps.loadRouteMatrixPolicyForRunFn({
    config,
    category,
    categoryConfig,
    logger,
  });
  logger.info('route_matrix_policy_resolved', {
    category,
    source: routeMatrixPolicy.source,
    row_count: Number(routeMatrixPolicy.row_count || 0),
    route_key: routeMatrixPolicy.route_key || null,
    model_ladder_today: routeMatrixPolicy.model_ladder_today || '',
    max_tokens: Number(routeMatrixPolicy.max_tokens || 0),
    single_source_data: Boolean(routeMatrixPolicy.single_source_data),
    all_source_data: Boolean(routeMatrixPolicy.all_source_data),
    enable_websearch: Boolean(routeMatrixPolicy.enable_websearch),
    all_sources_confidence_repatch: Boolean(routeMatrixPolicy.all_sources_confidence_repatch),
    insufficient_evidence_action: routeMatrixPolicy.insufficient_evidence_action || 'threshold_unmet',
    scalar_linked_send: routeMatrixPolicy.scalar_linked_send,
    component_values_send: routeMatrixPolicy.component_values_send,
    list_values_send: routeMatrixPolicy.list_values_send,
    min_evidence_refs_effective: Number(routeMatrixPolicy.min_evidence_refs_effective || 1),
    prime_sources_visual_send: Boolean(routeMatrixPolicy.prime_sources_visual_send),
  });

  const billingMonth = new Date().toISOString().slice(0, 7);
  const fieldOrder = categoryConfig.fieldOrder;
  const requiredFields = job.requirements?.requiredFields || categoryConfig.requiredFields;

  // WHY: Planner removed. Collect seeds as plain arrays and blocked hosts from
  // runtime overrides. Discovery pipeline runs without a planner — bootstrapPhase
  // generates manufacturerSeedUrls on ctx, and domainClassifierPhase skips enqueue.
  logger.info('bootstrap_step', { step: 'seeds', progress: 40 });
  const runtimeOverrides = await syncRuntimeOverrides({ force: true });
  const blockedHosts = new Set(runtimeOverrides?.blocked_domains || []);
  const seedUrls = job.seedUrls || [];

  const learningProfile = await runtimeDeps.loadLearningProfileFn({
    storage,
    config,
    category,
    job,
  });
  // WHY: Brand/model tokens used by learning seed filter to match URLs
  const brand = String(identityLock.brand || job?.identityLock?.brand || job?.brand || '').trim();
  const model = String(identityLock.model || job?.identityLock?.model || job?.model || '').trim();
  const brandTokens = brand ? brand.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) : [];
  const modelTokens = model ? model.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) : [];
  const learningSeedUrls = runtimeDeps.collectLearningSeedsFn(learningProfile, { brandTokens, modelTokens });

  logger.info('bootstrap_step', { step: 'llm', progress: 65 });
  const billingSnapshot = await runtimeDeps.readBillingSnapshotFn({
    storage,
    month: billingMonth,
    productId,
  });
  const llmRuntime = runtimeDeps.createRunLlmRuntimeFn({
    storage,
    config,
    category,
    productId,
    runId,
    roundContext,
    runtimeMode,
    traceWriter,
    routeMatrixPolicy,
    runtimeOverrides,
    billingSnapshot,
    stableHashFn: stableHash,
    normalizeCostRatesFn: runtimeDeps.normalizeCostRatesFn,
    appendCostLedgerEntryFn: runtimeDeps.appendCostLedgerEntryFn,
    recordPromptResultFn: runtimeDeps.recordPromptResultFn,
    defaultIndexLabRootFn: runtimeDeps.defaultIndexLabRootFn,
    joinPathFn: runtimeDeps.joinPathFn,
    mkdirSyncFn: runtimeDeps.mkdirSyncFn,
  });
  const llmContext = llmRuntime.llmContext;

  const learningStoreHints = await runtimeDeps.loadLearningStoreHintsForRunFn({
    config,
    category,
    roundContext,
    requiredFields,
    categoryConfig,
    importSpecDbFn: async () => import('../../db/specDb.js'),
    createUrlMemoryStoreFn: (db) => new runtimeDeps.UrlMemoryStoreClass(db),
    createDomainFieldYieldStoreFn: (db) => new runtimeDeps.DomainFieldYieldStoreClass(db),
    createFieldAnchorsStoreFn: (db) => new runtimeDeps.FieldAnchorsStoreClass(db),
    createComponentLexiconStoreFn: (db) => new runtimeDeps.ComponentLexiconStoreClass(db),
    normalizeFieldListFn: runtimeDeps.normalizeFieldListFn,
    readLearningHintsFromStoresFn: runtimeDeps.readLearningHintsFromStoresFn,
  });

  logger.info('bootstrap_step', { step: 'needset', progress: 85 });
  const initialNeedSet = runtimeDeps.computeNeedSetFn({
    runId,
    category,
    productId,
    fieldOrder,
    provenance: {},
    fieldRules: categoryConfig.fieldRules,
    fieldReasoning: {},
    constraintAnalysis: {},
    identityContext: {
      status: identityLockStatus || 'unknown',
      confidence: 0,
      identity_gate_validated: false,
      extraction_gate_open: true,
      family_model_count: Number(identityLock.family_model_count || 0),
      ambiguity_level: String(identityLock.ambiguity_level || '').trim().toLowerCase(),
      publishable: false,
      publish_blockers: [],
      reason_codes: [],
      page_count: 0,
      max_match_score: 0,
    },
    brand,
    model,
    baseModel: String(identityLock.base_model || job?.identityLock?.base_model || '').trim(),
    round: 0,
  });
  logger.info('needset_computed', {
    ...initialNeedSet,
    productId,
    runId,
    category,
    scope: 'initial',
    needset_size: Array.isArray(initialNeedSet.fields)
      ? initialNeedSet.fields.filter((f) => f.state !== 'accepted').length : 0,
  });

  // WHY: Discovery pipeline runs without a planner. bootstrapPhase generates
  // manufacturerSeedUrls on ctx. domainClassifierPhase skips planner.enqueue().
  const discoveryResult = await runtimeDeps.runDiscoverySeedPlanFn({
    ...runtimeDeps.buildDiscoverySeedPlanContextFn({
      config,
      runtimeOverrides,
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
      planner: null,
      normalizeFieldList: runtimeDeps.normalizeFieldListFn,
    }),
  });

  const { orderedSources, workerIdMap, stats } = runtimeDeps.buildOrderedFetchPlanFn({
    discoveryResult,
    seedUrls,
    learningSeedUrls,
    blockedHosts,
    config,
    logger,
  });

  // WHY: Write fetch plan snapshot to trace (replaces runPlannerQueueSnapshotPhase)
  if (traceWriter) {
    try {
      await traceWriter.writeJson({
        section: 'planner',
        prefix: 'fetch_plan_snapshot',
        payload: {
          ts: new Date().toISOString(),
          total_queued: stats.total_queued,
          seed_count: stats.seed_count,
          learning_seed_count: stats.learning_seed_count,
          approved_count: stats.approved_count,
          blocked_count: stats.blocked_count,
          blocked_hosts: stats.blocked_hosts,
        },
        ringSize: 20,
      });
    } catch { /* swallow trace errors */ }
  }

  return {
    orderedFetchPlan: orderedSources,
    workerIdMap,
    fetchPlanStats: stats,
    runtimeOverrides,
    discoveryResult,
  };
}
