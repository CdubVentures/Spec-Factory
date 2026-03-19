import test from 'node:test';
import assert from 'node:assert/strict';
import { runDiscoverySeedPlan } from '../src/features/indexing/orchestration/index.js';

function makeStorage() {
  return {
    resolveOutputKey: () => '_learning/test',
    readJsonOrNull: async () => null,
  };
}

function makeStageStubs(overrides = {}) {
  return {
    runNeedSetFn: async () => ({
      schema2: null,
      schema3: null,
      seedSchema4: null,
      searchPlanHandoff: null,
      focusGroups: [],
    }),
    runBrandResolverFn: async () => ({ brandResolution: null, promotedHosts: [] }),
    runSearchProfileFn: () => ({
      searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] },
      effectiveHostPlan: null,
      hostPlanQueryRows: [],
    }),
    runSearchPlannerFn: async () => ({ schema4Plan: null, uberSearchPlan: null }),
    runQueryJourneyFn: async () => ({
      queries: [],
      selectedQueryRowMap: new Map(),
      profileQueryRowsByQuery: new Map(),
      searchProfilePlanned: {},
      searchProfileKeys: {},
      executionQueryLimit: 0,
      queryLimit: 8,
      queryRejectLogCombined: [],
    }),
    executeSearchQueriesFn: async () => ({
      rawResults: [],
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: null,
    }),
    processDiscoveryResultsFn: async () => ({
      enabled: true,
      approvedUrls: ['https://approved.example/spec'],
      candidateUrls: ['https://candidate.example/spec'],
      candidates: [],
    }),
    runDomainClassifierFn: () => ({ enqueuedCount: 0, seededCount: 0 }),
    ...overrides,
  };
}

test('runDiscoverySeedPlan builds discovery hints, applies runtime search-disable override, and seeds planner queues', async () => {
  const normalizeCalls = [];
  const plannerApprovedDiscoveryCalls = [];
  const plannerCandidateSeedCalls = [];
  const loadSourceEntryCalls = [];
  const sourceEntries = [{
    sourceId: 'rtings_com',
    host: 'rtings.com',
    discovery: { method: 'search_first', enabled: true, priority: 90 },
  }];

  // Use real domain classifier to test enqueue behavior
  const { runDomainClassifier } = await import('../src/features/indexing/discovery/stages/domainClassifier.js');

  const result = await runDiscoverySeedPlan({
    config: {
      searchEngines: 'serper',
      maxCandidateUrls: 10,
      fetchCandidateSources: true,
      marker: 'cfg',
    },
    runtimeOverrides: {
      disable_search: true,
    },
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g', 'battery_life_hours'],
      schema: {
        critical_fields: ['battery_life_hours'],
      },
    },
    job: { productId: 'mouse-sample' },
    runId: 'run_12345678',
    logger: { info: () => {}, warn: () => {} },
    roundContext: {
      missing_required_fields: ['weight_g'],
      missing_critical_fields: ['battery_life_hours'],
      bundle_hints: [{ bundle_id: 'core_spec_sheet', fields: ['weight_g'] }],
    },
    requiredFields: ['weight_g'],
    llmContext: { marker: 'llm' },
    frontierDb: { marker: 'frontier' },
    traceWriter: { marker: 'trace' },
    learningStoreHints: { marker: 'learning' },
    planner: {
      enqueue(url, discoveredFrom, options) {
        plannerApprovedDiscoveryCalls.push({ url, discoveredFrom, options });
        return true;
      },
      seedCandidates(urls, options) {
        plannerCandidateSeedCalls.push({ urls, options });
      },
      enqueueCounters: { total: 0 },
    },
    normalizeFieldListFn: (fields, options) => {
      normalizeCalls.push({ fields, options });
      return Array.from(fields || []).filter(Boolean);
    },
    loadEnabledSourceEntriesFn: async ({ config, category }) => {
      loadSourceEntryCalls.push({ config, category });
      return sourceEntries;
    },
    ...makeStageStubs({
      runDomainClassifierFn: (args) => runDomainClassifier(args),
    }),
  });

  assert.ok(result.enabled, 'result should be enabled');
  assert.ok(normalizeCalls.length >= 2, 'normalizeFn called at least twice');
  assert.equal(loadSourceEntryCalls.length, 1);
  assert.equal(loadSourceEntryCalls[0].category, 'mouse');
  assert.equal(loadSourceEntryCalls[0].config.marker, 'cfg');

  assert.deepEqual(plannerApprovedDiscoveryCalls, [
    {
      url: 'https://approved.example/spec',
      discoveredFrom: 'discovery_approved',
      options: { forceApproved: true, forceBrandBypass: false, triageMeta: null },
    },
  ]);
  assert.deepEqual(plannerCandidateSeedCalls, [
    {
      urls: ['https://candidate.example/spec'],
      options: { triageMetaMap: plannerCandidateSeedCalls[0]?.options?.triageMetaMap },
    },
  ]);
});

test('runDiscoverySeedPlan skips candidate seeding when fetchCandidateSources is disabled', async () => {
  let plannerCandidateSeeded = false;
  const { runDomainClassifier } = await import('../src/features/indexing/discovery/stages/domainClassifier.js');

  await runDiscoverySeedPlan({
    config: {
      searchEngines: 'serper',
      maxCandidateUrls: 10,
      fetchCandidateSources: false,
    },
    runtimeOverrides: {},
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g'],
      schema: {
        critical_fields: ['battery_life_hours'],
      },
    },
    job: { productId: 'mouse-sample' },
    runId: 'run_87654321',
    logger: { info: () => {}, warn: () => {} },
    roundContext: {
      missing_required_fields: ['weight_g'],
      missing_critical_fields: ['battery_life_hours'],
      extra_queries: [],
    },
    requiredFields: ['weight_g'],
    llmContext: {},
    frontierDb: null,
    traceWriter: null,
    learningStoreHints: null,
    planner: {
      enqueue() {},
      seedCandidates() {
        plannerCandidateSeeded = true;
      },
      enqueueCounters: { total: 0 },
    },
    normalizeFieldListFn: (fields) => Array.from(fields || []).filter(Boolean),
    loadEnabledSourceEntriesFn: async () => [],
    ...makeStageStubs({
      processDiscoveryResultsFn: async () => ({
        enabled: true,
        approvedUrls: [],
        candidateUrls: ['https://candidate.example/spec'],
        candidates: [],
      }),
      runDomainClassifierFn: (args) => runDomainClassifier(args),
    }),
  });

  assert.equal(plannerCandidateSeeded, false);
});

test('runDiscoverySeedPlan recovers searchProvider when roundConfigBuilder sets it to none (round 0)', async () => {
  let capturedSearchConfig = null;

  await runDiscoverySeedPlan({
    config: {
      searchEngines: '',
      discoveryEnabled: false,
      maxCandidateUrls: 10,
      fetchCandidateSources: true,
    },
    runtimeOverrides: {},
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g'],
      schema: { critical_fields: [] },
    },
    job: { productId: 'mouse-round0' },
    runId: 'run_round0',
    logger: { info: () => {}, warn: () => {} },
    roundContext: {},
    requiredFields: [],
    llmContext: {},
    frontierDb: null,
    traceWriter: null,
    learningStoreHints: null,
    planner: { enqueue() {}, seedCandidates() {}, enqueueCounters: { total: 0 } },
    normalizeFieldListFn: (fields) => Array.from(fields || []).filter(Boolean),
    loadEnabledSourceEntriesFn: async () => [],
    ...makeStageStubs({
      executeSearchQueriesFn: async (args) => {
        capturedSearchConfig = args.config;
        return {
          rawResults: [],
          searchAttempts: [],
          searchJournal: [],
          internalSatisfied: false,
          externalSearchReason: null,
        };
      },
    }),
  });

  // WHY: discoveryEnabled is a pipeline invariant — always forced true.
  assert.equal(capturedSearchConfig.discoveryEnabled, true);
  // WHY: searchProvider 'none' from round 0 config must be recovered to 'bing,google'.
  assert.equal(capturedSearchConfig.searchEngines, 'bing,google');
});
