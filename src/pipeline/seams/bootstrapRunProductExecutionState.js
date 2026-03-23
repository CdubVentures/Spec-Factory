import fs from 'node:fs';
import path from 'node:path';
import { configInt } from '../../shared/settingsAccessor.js';

import { loadCategoryConfig } from '../../categories/loader.js';
import { SourcePlanner } from '../../planner/sourcePlanner.js';
import { PlaywrightFetcher, DryRunFetcher, HttpFetcher, CrawleeFetcher } from '../../fetcher/playwrightFetcher.js';
import { selectFetcherMode } from '../../fetcher/fetcherMode.js';
import { createHostConcurrencyGate, createRequestThrottler } from '../../concurrency/requestThrottler.js';
import {
  readLearningHintsFromStores,
  UrlMemoryStore,
  DomainFieldYieldStore,
  FieldAnchorsStore,
  ComponentLexiconStore,
  loadCategoryBrain,
  applyLearningSeeds,
  loadLearningProfile,
} from '../../features/indexing/learning/index.js';
import {
  resolveScreencastCallback,
  createRunProductFetcherFactory,
  buildIndexlabRuntimeCategoryConfig,
  loadRouteMatrixPolicyForRun,
  applyRuntimeOverridesToPlanner,
  resolveTargets,
  resolveLlmTargetFields,
  toInt,
  stableHash,
} from '../../features/indexing/orchestration/shared/index.js';
import {
  createRunLlmRuntime,
  loadLearningStoreHintsForRun,
  createPlannerBootstrap,
  createModeAwareFetcherRegistry,
  runPlannerQueueSnapshotPhase,
  buildFetcherStartContext,
  runFetcherStartPhase,
} from '../../features/indexing/orchestration/bootstrap/index.js';
import {
  buildDiscoverySeedPlanContext,
  runDiscoverySeedPlan,
} from '../../features/indexing/orchestration/discovery/index.js';
// WHY: Adapter subsystem removed — baseline LLM extraction handles all sources.
// No-op factory preserves DI shape while adapters are retired.
function createNoOpAdapterManager() {
  return {
    collectSeedUrls: () => [],
    extractForPage: async () => ({}),
    runDedicatedAdapters: async () => ({ syntheticSources: [], adapterArtifacts: [] }),
  };
}
import { DeterministicParser, ComponentResolver, retrieveGoldenExamples } from '../../features/indexing/extraction/index.js';
import { loadSourceIntel } from '../../intel/sourceIntel.js';
import { readBillingSnapshot } from '../../billing/costLedger.js';
import { defaultIndexLabRoot } from '../../core/config/runtimeArtifactRoots.js';
import { normalizeCostRates } from '../../billing/costRates.js';
import { normalizeFieldList } from '../../utils/fieldKeys.js';
import { createFieldRulesEngine } from '../../engine/fieldRulesEngine.js';
import { computeNeedSet } from '../../indexlab/needsetEngine.js';
import { recordPromptResult } from '../../features/indexing/discovery/index.js';
import { appendCostLedgerEntry } from '../../billing/costLedger.js';
import { initializeIndexingResume } from './initializeIndexingResume.js';

const DEFAULT_DEPS = {
  loadCategoryConfigFn: loadCategoryConfig,
  buildIndexlabRuntimeCategoryConfigFn: buildIndexlabRuntimeCategoryConfig,
  loadRouteMatrixPolicyForRunFn: loadRouteMatrixPolicyForRun,
  createFieldRulesEngineFn: createFieldRulesEngine,
  DeterministicParserClass: DeterministicParser,
  ComponentResolverClass: ComponentResolver,
  resolveLlmTargetFieldsFn: resolveLlmTargetFields,
  retrieveGoldenExamplesFn: retrieveGoldenExamples,
  resolveTargetsFn: resolveTargets,
  loadCategoryBrainFn: loadCategoryBrain,
  createPlannerBootstrapFn: createPlannerBootstrap,
  createAdapterManagerFn: createNoOpAdapterManager,
  loadSourceIntelFn: loadSourceIntel,
  SourcePlannerClass: SourcePlanner,
  applyRuntimeOverridesToPlannerFn: applyRuntimeOverridesToPlanner,
  initializeIndexingResumeFn: initializeIndexingResume,
  loadLearningProfileFn: loadLearningProfile,
  applyLearningSeedsFn: applyLearningSeeds,
  selectFetcherModeFn: selectFetcherMode,
  createRequestThrottlerFn: createRequestThrottler,
  createHostConcurrencyGateFn: createHostConcurrencyGate,
  resolveScreencastCallbackFn: resolveScreencastCallback,
  createRunProductFetcherFactoryFn: createRunProductFetcherFactory,
  DryRunFetcherClass: DryRunFetcher,
  HttpFetcherClass: HttpFetcher,
  CrawleeFetcherClass: CrawleeFetcher,
  PlaywrightFetcherClass: PlaywrightFetcher,
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
  runPlannerQueueSnapshotPhaseFn: runPlannerQueueSnapshotPhase,
  buildFetcherStartContextFn: buildFetcherStartContext,
  runFetcherStartPhaseFn: runFetcherStartPhase,
  createModeAwareFetcherRegistryFn: createModeAwareFetcherRegistry,
  enqueueAdapterSeedUrlsFn: () => {},
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

  const previousFinalSpec = await storage.readJsonOrNull(
    storage.resolveOutputKey(category, productId, 'final', 'spec.json'),
  );

  let runtimeFieldRulesEngine = null;
  try {
    runtimeFieldRulesEngine = await runtimeDeps.createFieldRulesEngineFn(category, {
      config,
      consumerSystem: 'indexlab',
    });
  } catch (error) {
    logger.warn('field_rules_engine_init_failed', {
      category,
      productId,
      message: error.message,
    });
  }

  const deterministicParser = runtimeFieldRulesEngine
    ? new runtimeDeps.DeterministicParserClass(runtimeFieldRulesEngine)
    : null;
  const componentResolver = runtimeFieldRulesEngine
    ? new runtimeDeps.ComponentResolverClass(runtimeFieldRulesEngine)
    : null;
  const billingMonth = new Date().toISOString().slice(0, 7);
  const fieldOrder = categoryConfig.fieldOrder;
  const requiredFields = job.requirements?.requiredFields || categoryConfig.requiredFields;
  const focus_fields = runtimeDeps.resolveLlmTargetFieldsFn(job, categoryConfig);
  const goldenExamples = await runtimeDeps.retrieveGoldenExamplesFn({
    storage,
    category,
    job,
    limit: 5,
  });
  const targets = runtimeDeps.resolveTargetsFn(job, categoryConfig);
  const anchors = job.anchors || {};
  const indexingHelperFlowEnabled = false;
  const helperContext = { enabled: false, active_match: null, supportive_matches: [], seed_urls: [] };
  const categoryBrainLoaded = await runtimeDeps.loadCategoryBrainFn({
    storage,
    category,
  });
  const learnedConstraints = categoryBrainLoaded?.artifacts?.constraints?.value || {};
  const learnedFieldYield = categoryBrainLoaded?.artifacts?.fieldYield?.value || {};
  const learnedFieldAvailability = categoryBrainLoaded?.artifacts?.fieldAvailability?.value || {};

  logger.info('bootstrap_step', { step: 'planner', progress: 40 });
  const {
    adapterManager,
    sourceIntel,
    planner,
    runtimeOverrides,
  } = await runtimeDeps.createPlannerBootstrapFn({
    storage,
    config,
    logger,
    category,
    job,
    categoryConfig,
    requiredFields,
    createAdapterManagerFn: runtimeDeps.createAdapterManagerFn,
    loadSourceIntelFn: runtimeDeps.loadSourceIntelFn,
    createSourcePlannerFn: (...args) => new runtimeDeps.SourcePlannerClass(...args),
    syncRuntimeOverridesFn: syncRuntimeOverrides,
    applyRuntimeOverridesToPlannerFn: runtimeDeps.applyRuntimeOverridesToPlannerFn,
  });

  const indexingResumeState = await runtimeDeps.initializeIndexingResumeFn({
    storage,
    config,
    category,
    productId,
    logger,
    planner,
    frontierDb,
  });

  let learningProfile = null;
  if (config.selfImproveEnabled) {
    learningProfile = await runtimeDeps.loadLearningProfileFn({
      storage,
      config,
      category,
      job,
    });
    runtimeDeps.applyLearningSeedsFn(planner, learningProfile);
  }

  const adapterSeedUrls = adapterManager.collectSeedUrls({ job });
  runtimeDeps.enqueueAdapterSeedUrlsFn(planner, adapterSeedUrls);

  const initialFetcherMode = runtimeDeps.selectFetcherModeFn(config);
  const fetchRequestThrottler = runtimeDeps.createRequestThrottlerFn({
    globalRps: configInt(config, 'globalRequestRps'),
    globalBurst: configInt(config, 'globalRequestBurst'),
    keyRps: configInt(config, 'domainRequestRps'),
    keyBurst: configInt(config, 'domainRequestBurst'),
  });
  const fetchHostConcurrencyGate = runtimeDeps.createHostConcurrencyGateFn({
    maxInFlight: configInt(config, 'fetchPerHostConcurrencyCap'),
  });
  const fetcherConfig = {
    ...config,
    requestThrottler: fetchRequestThrottler,
  };
  const screencastCallback = runtimeDeps.resolveScreencastCallbackFn(config);
  const createFetcherForMode = runtimeDeps.createRunProductFetcherFactoryFn({
    fetcherConfig,
    logger,
    screencastCallback,
    DryRunFetcherClass: runtimeDeps.DryRunFetcherClass,
    HttpFetcherClass: runtimeDeps.HttpFetcherClass,
    CrawleeFetcherClass: runtimeDeps.CrawleeFetcherClass,
    PlaywrightFetcherClass: runtimeDeps.PlaywrightFetcherClass,
  });
  let fetcher = createFetcherForMode(initialFetcherMode) || createFetcherForMode('playwright');
  let fetcherMode = initialFetcherMode;
  let fetcherStartFallbackReason = '';
  // WHY: Warm up browser in background while discovery runs.
  // fetcher.start() has zero dependency on discovery data. PlaywrightFetcher.start()
  // and CrawleeFetcher.start() are both idempotent — safe to call twice.
  const fetcherBootPromise = typeof fetcher?.start === 'function'
    ? fetcher.start().catch((err) => ({ error: err }))
    : Promise.resolve(null);

  const sourceResults = [];
  const attemptedSourceUrls = new Set();
  const llmRetryReasonByUrl = new Map();
  const successfulSourceMetaByUrl = new Map();
  const repairQueryByDomain = new Set();
  const blockedDomainHitCount = new Map();
  const blockedDomainsApplied = new Set();
  const hostBudgetByHost = new Map();
  const blockedDomainThreshold = Math.max(1, toInt(config.frontierBlockedDomainThreshold, 2));
  const repairSearchEnabled = true;
  const repairDedupeRule = String(config.repairDedupeRule || 'domain_once').trim().toLowerCase();
  const llmSatisfiedFields = new Set();
  const helperSupportiveSyntheticSources = [];
  const artifactsByHost = {};
  let artifactSequence = 0;
  const adapterArtifacts = [];
  let helperFilledFields = [];
  let helperFilledByMethod = {};
  let helperMismatches = [];
  const llmValidatorDecisions = {
    enabled: false,
    accept: [],
    reject: [],
    unknown: [],
  };
  let llmCandidatesAccepted = 0;
  let llmSourcesUsed = 0;
  let hypothesisFollowupRoundsExecuted = 0;
  let hypothesisFollowupSeededUrls = 0;

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
  const phase08BatchRows = [];
  let phase08FieldContexts = {};
  let phase08PrimeRows = [];

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
    brand: String(identityLock.brand || job?.identityLock?.brand || job?.brand || '').trim(),
    model: String(identityLock.model || job?.identityLock?.model || job?.model || '').trim(),
    baseModel: String(identityLock.base_model || job?.identityLock?.base_model || '').trim(),
    round: 0,
  });
  // WHY: The runtime bridge + prefetch panel need the full NeedSet payload
  // (fields, summary, blockers, identity, planner_seed) — not just summary counts.
  // Without spreading the full object, the GUI prefetch panel renders empty.
  logger.info('needset_computed', {
    ...initialNeedSet,
    productId,
    runId,
    category,
    scope: 'initial',
    needset_size: Array.isArray(initialNeedSet.fields)
      ? initialNeedSet.fields.filter((f) => f.state !== 'accepted').length : 0,
  });

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
      planner,
      normalizeFieldList: runtimeDeps.normalizeFieldListFn,
    }),
  });
  await runtimeDeps.runPlannerQueueSnapshotPhaseFn({
    traceWriter,
    planner,
    logger,
  });

  // WHY: Await the background browser boot before entering fetch phase.
  // If it failed, runFetcherStartPhase handles the fallback to HTTP.
  const fetcherBootResult = await fetcherBootPromise;
  if (fetcherBootResult?.error) {
    logger.warn('fetcher_background_boot_failed', { message: fetcherBootResult.error.message });
  }

  const fetcherStartState = await runtimeDeps.runFetcherStartPhaseFn({
    ...runtimeDeps.buildFetcherStartContextFn({
      fetcher,
      fetcherMode,
      config,
      logger,
      fetcherConfig,
      HttpFetcherClass: runtimeDeps.HttpFetcherClass,
    }),
  });
  fetcher = fetcherStartState.fetcher;
  fetcherMode = fetcherStartState.fetcherMode;
  fetcherStartFallbackReason = fetcherStartState.fetcherStartFallbackReason;
  const modeAwareFetcherRegistry = runtimeDeps.createModeAwareFetcherRegistryFn({
    initialFetcher: fetcher,
    initialMode: fetcherMode,
    createFetcherForModeFn: createFetcherForMode,
  });

  return {
    storage,
    config,
    logger,
    category,
    productId,
    runId,
    job,
    frontierDb,
    runArtifactsBase,
    traceWriter,
    authoringCategoryConfig,
    categoryConfig,
    routeMatrixPolicy,
    previousFinalSpec,
    runtimeFieldRulesEngine,
    deterministicParser,
    componentResolver,
    fieldOrder,
    requiredFields,
    focus_fields,
    goldenExamples,
    targets,
    anchors,
    indexingHelperFlowEnabled,
    helperContext,
    learnedConstraints,
    learnedFieldYield,
    learnedFieldAvailability,
    adapterManager,
    sourceIntel,
    planner,
    runtimeOverrides,
    ...indexingResumeState,
    learningProfile,
    fetchRequestThrottler,
    fetchHostConcurrencyGate,
    fetcherConfig,
    fetcher,
    fetcherMode,
    fetcherStartFallbackReason,
    modeAwareFetcherRegistry,
    sourceResults,
    attemptedSourceUrls,
    llmRetryReasonByUrl,
    successfulSourceMetaByUrl,
    repairQueryByDomain,
    blockedDomainHitCount,
    blockedDomainsApplied,
    hostBudgetByHost,
    blockedDomainThreshold,
    repairSearchEnabled,
    repairDedupeRule,
    llmSatisfiedFields,
    helperSupportiveSyntheticSources,
    artifactsByHost,
    artifactSequence,
    adapterArtifacts,
    helperFilledFields,
    helperFilledByMethod,
    helperMismatches,
    llmValidatorDecisions,
    llmCandidatesAccepted,
    llmSourcesUsed,
    hypothesisFollowupRoundsExecuted,
    hypothesisFollowupSeededUrls,
    llmRuntime,
    llmContext,
    phase08BatchRows,
    phase08FieldContexts,
    phase08PrimeRows,
    learningStoreHints,
    initialNeedSet,
    discoveryResult,
  };
}
