import test from 'node:test';
import assert from 'node:assert/strict';

import { bootstrapRunProductExecutionState } from '../src/pipeline/seams/bootstrapRunProductExecutionState.js';

test('bootstrapRunProductExecutionState wires category/planner/fetcher bootstrap into reusable execution state', async () => {
  const calls = [];
  const planner = {
    enqueue(url, kind, options) {
      calls.push(['planner.enqueue', url, kind, options]);
      return true;
    },
  };
  const adapterManager = {
    collectSeedUrls({ job }) {
      calls.push(['adapter.collectSeedUrls', job.productId]);
      return ['https://seed.example.com'];
    },
  };
  const llmRuntime = {
    llmCostRates: { prompt: 1 },
    llmContext: { enabled: true },
  };

  const result = await bootstrapRunProductExecutionState({
    storage: {
      resolveOutputKey: (...parts) => parts.join('/'),
      readJsonOrNull: async (key) => {
        calls.push(['storage.readJsonOrNull', key]);
        return { existing: true };
      },
    },
    config: {
      selfImproveEnabled: true,
      globalRequestRps: 4,
      globalRequestBurst: 8,
      domainRequestRps: 2,
      domainRequestBurst: 4,
      fetchPerHostConcurrencyCap: 3,
    },
    logger: {
      info(event, payload) {
        calls.push(['logger.info', event, payload]);
      },
      warn() {},
    },
    category: 'mouse',
    productId: 'mouse-1',
    runId: 'run-1',
    roundContext: { round: 2 },
    runtimeMode: 'production',
    job: {
      productId: 'mouse-1',
      identityLock: { brand: 'Probe', model: 'Alpha' },
      requirements: { requiredFields: ['dpi'] },
      anchors: { shape: 'ergonomic' },
    },
    identityLock: { ambiguity_level: 'low', family_model_count: 1 },
    identityLockStatus: 'locked',
    runArtifactsBase: 'runs/base',
    traceWriter: { id: 'trace-writer' },
    syncRuntimeOverrides: async ({ force } = {}) => {
      calls.push(['syncRuntimeOverrides', force]);
      return { blocked_domains: ['runtime.example.com'] };
    },
    frontierDb: { id: 'frontier-db' },
    deps: {
      loadCategoryConfigFn: async (category) => {
        calls.push(['loadCategoryConfig', category]);
        return { category, fieldOrder: ['dpi'], requiredFields: ['dpi'], fieldRules: { dpi: {} } };
      },
      buildIndexlabRuntimeCategoryConfigFn: (config) => {
        calls.push(['buildIndexlabRuntimeCategoryConfig', config.category]);
        return config;
      },
      loadRouteMatrixPolicyForRunFn: async ({ category }) => {
        calls.push(['loadRouteMatrixPolicyForRun', category]);
        return { source: 'defaults', row_count: 1 };
      },
      createFieldRulesEngineFn: async (categoryArg) => {
        calls.push(['createFieldRulesEngine', categoryArg]);
        return { id: 'field-rules-engine' };
      },
      DeterministicParserClass: class DeterministicParserStub {
        constructor(engine) {
          this.engine = engine;
        }
      },
      ComponentResolverClass: class ComponentResolverStub {
        constructor(engine) {
          this.engine = engine;
        }
      },
      resolveLlmTargetFieldsFn: () => ['dpi'],
      retrieveGoldenExamplesFn: async ({ category }) => {
        calls.push(['retrieveGoldenExamples', category]);
        return [{ id: 1 }];
      },
      resolveTargetsFn: () => ({ targetConfidence: 0.9 }),
      loadCategoryBrainFn: async ({ category }) => {
        calls.push(['loadCategoryBrain', category]);
        return {
          artifacts: {
            constraints: { value: { dpi: {} } },
            fieldYield: { value: { dpi: 1 } },
            fieldAvailability: { value: { dpi: 'known' } },
          },
        };
      },
      createPlannerBootstrapFn: async ({ requiredFields }) => {
        calls.push(['createPlannerBootstrap', requiredFields]);
        return {
          adapterManager,
          sourceIntel: { data: { domains: {} } },
          planner,
          runtimeOverrides: { blocked_domains: ['planner.example.com'] },
        };
      },
      initializeIndexingResumeFn: async ({ category, productId }) => {
        calls.push(['initializeIndexingResume', category, productId]);
        return {
          indexingResumeKey: 'resume/key',
          resumeMode: 'auto',
          resumeMaxAgeHours: 24,
          previousResumeStateAgeHours: 1.5,
          resumeReextractEnabled: true,
          resumeReextractAfterHours: 48,
          resumePersistLimit: 100,
          resumeRetryPersistLimit: 50,
          previousResumePendingUnseeded: ['https://pending.example.com'],
          previousResumeRetryRows: [{ url: 'https://retry.example.com' }],
          previousResumeSuccessRows: [{ url: 'https://success.example.com' }],
          resumeCooldownSkippedUrls: new Set(['https://cooldown.example.com']),
          resumeFetchFailedUrls: new Set(['https://failed.example.com']),
          resumeSeededPendingCount: 1,
          resumeSeededLlmRetryCount: 2,
          resumeSeededReextractCount: 3,
        };
      },
      loadLearningProfileFn: async ({ category }) => {
        calls.push(['loadLearningProfile', category]);
        return { id: 'learning-profile' };
      },
      applyLearningSeedsFn: (plannerArg, learningProfile) => {
        calls.push(['applyLearningSeeds', plannerArg, learningProfile]);
      },
      selectFetcherModeFn: () => 'crawlee',
      createRequestThrottlerFn: (config) => {
        calls.push(['createRequestThrottler', config]);
        return { id: 'request-throttler' };
      },
      createHostConcurrencyGateFn: (config) => {
        calls.push(['createHostConcurrencyGate', config]);
        return { id: 'host-gate' };
      },
      resolveScreencastCallbackFn: () => 'screencast-callback',
      createRunProductFetcherFactoryFn: ({ fetcherConfig, logger, screencastCallback }) => {
        calls.push(['createRunProductFetcherFactory', fetcherConfig.requestThrottler.id, Boolean(logger), screencastCallback]);
        return (mode) => ({ mode, started: false });
      },
      readBillingSnapshotFn: async ({ month, productId }) => {
        calls.push(['readBillingSnapshot', month, productId]);
        return { monthly_cost_usd: 1.25 };
      },
      createRunLlmRuntimeFn: (input) => {
        calls.push(['createRunLlmRuntime', input.category, input.runtimeOverrides.blocked_domains]);
        return llmRuntime;
      },
      loadLearningStoreHintsForRunFn: async ({ category, requiredFields }) => {
        calls.push(['loadLearningStoreHintsForRun', category, requiredFields]);
        return { hints: true };
      },
      computeNeedSetFn: ({ category, productId, brand, model }) => {
        calls.push(['computeNeedSet', category, productId]);
        return {
          total_fields: 1,
          rows: [{ field_key: 'dpi', required_level: 'required', priority_bucket: 'core', state: 'missing', bundle_id: '' }],
          focus_fields: ['dpi'],
          bundles: [],
          summary: { core_unresolved: 1, secondary_unresolved: 0, optional_unresolved: 0, conflicts: 0, bundles_planned: 0 },
          blockers: { missing: 1, weak: 0, conflict: 0 },
          identity: {
            state: 'unverified',
            source_label_state: 'none',
            manufacturer: brand || null,
            model: model || null,
            confidence: 0,
            official_domain: null,
            support_domain: null,
          },
          planner_seed: {
            missing_critical_fields: ['dpi'],
            unresolved_fields: ['dpi'],
            existing_queries: [],
            current_product_identity: {
              category: category || '',
              brand: brand || '',
              model: model || '',
            },
          },
        };
      },
      buildDiscoverySeedPlanContextFn: (input) => {
        calls.push(['buildDiscoverySeedPlanContext', input.category, input.requiredFields]);
        return { marker: 'discovery-context', ...input };
      },
      runDiscoverySeedPlanFn: async (input) => {
        calls.push(['runDiscoverySeedPlan', input.marker, input.runtimeOverrides.blocked_domains]);
        return { seeded: true };
      },
      runPlannerQueueSnapshotPhaseFn: async ({ planner: plannerArg }) => {
        calls.push(['runPlannerQueueSnapshotPhase', plannerArg]);
      },
      buildFetcherStartContextFn: (input) => {
        calls.push(['buildFetcherStartContext', input.fetcherMode]);
        return { marker: 'fetcher-start-context', ...input };
      },
      runFetcherStartPhaseFn: async (input) => {
        calls.push(['runFetcherStartPhase', input.marker]);
        return {
          fetcher: { mode: 'http', started: true },
          fetcherMode: 'http',
          fetcherStartFallbackReason: 'http_fallback',
        };
      },
      createModeAwareFetcherRegistryFn: ({ initialFetcher, initialMode }) => {
        calls.push(['createModeAwareFetcherRegistry', initialFetcher.mode, initialMode]);
        return {
          id: 'mode-aware-registry',
          stopAll: async () => {},
          fetchWithMode: async () => {},
        };
      },
      enqueueAdapterSeedUrlsFn: (plannerArg, urls) => {
        calls.push(['enqueueAdapterSeedUrls', plannerArg, urls]);
      },
      normalizeFieldListFn: (fields) => fields,
    },
  });

  assert.equal(result.categoryConfig.category, 'mouse');
  assert.deepEqual(result.job, {
    productId: 'mouse-1',
    identityLock: { brand: 'Probe', model: 'Alpha' },
    requirements: { requiredFields: ['dpi'] },
    anchors: { shape: 'ergonomic' },
  });
  assert.equal(result.previousFinalSpec.existing, true);
  assert.equal(result.runtimeFieldRulesEngine.id, 'field-rules-engine');
  assert.deepEqual(result.requiredFields, ['dpi']);
  assert.deepEqual(result.focus_fields, ['dpi']);
  assert.deepEqual(result.goldenExamples, [{ id: 1 }]);
  assert.deepEqual(result.targets, { targetConfidence: 0.9 });
  assert.equal(result.adapterManager, adapterManager);
  assert.equal(result.planner, planner);
  assert.deepEqual(result.runtimeOverrides, { blocked_domains: ['planner.example.com'] });
  assert.equal(result.learningProfile.id, 'learning-profile');
  assert.equal(result.fetchRequestThrottler.id, 'request-throttler');
  assert.equal(result.fetchHostConcurrencyGate.id, 'host-gate');
  assert.equal(result.fetcherMode, 'http');
  assert.equal(result.fetcherStartFallbackReason, 'http_fallback');
  assert.equal(result.modeAwareFetcherRegistry.id, 'mode-aware-registry');
  assert.equal(result.llmRuntime, llmRuntime);
  assert.deepEqual(result.learningStoreHints, { hints: true });
  assert.deepEqual(result.discoveryResult, { seeded: true });
  assert.equal(result.phase08BatchRows.length, 0);
  assert.deepEqual(result.phase08FieldContexts, {});
  assert.deepEqual(result.phase08PrimeRows, []);
  assert.equal(result.initialNeedSet.rows.length, 1);

  // NeedSet identity block — brand/model resolved via job.identityLock fallback chain
  assert.equal(result.initialNeedSet.identity.manufacturer, 'Probe');
  assert.equal(result.initialNeedSet.identity.model, 'Alpha');

  // NeedSet planner_seed — LLM planner receives product identity context
  assert.ok(result.initialNeedSet.planner_seed, 'planner_seed must not be null');
  assert.equal(result.initialNeedSet.planner_seed.current_product_identity.brand, 'Probe');
  assert.equal(result.initialNeedSet.planner_seed.current_product_identity.model, 'Alpha');

  assert.equal(result.resumeMode, 'auto');
  assert.equal(result.resumeSeededReextractCount, 3);
  assert.ok(calls.some(([name]) => name === 'runPlannerQueueSnapshotPhase'));
  assert.ok(calls.some(([name]) => name === 'createModeAwareFetcherRegistry'));
});
