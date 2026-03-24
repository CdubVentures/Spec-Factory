// WHY: Tests the Schema 2→3→4 computation wiring in runDiscoverySeedPlan.
// When config enables it and LLM is available, Schema 4 search_plan_handoff
// is computed BEFORE discovery and passed to discoverCandidateSources.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runDiscoverySeedPlan } from '../runDiscoverySeedPlan.js';

// --- helpers ---

function makeConfig(overrides = {}) {
  return {
    discoveryEnabled: true,
    searchEngines: 'bing,google',
    maxCandidateUrls: 10,
    fetchCandidateSources: true,
    ...overrides,
  };
}

function makeJob() {
  return {
    productId: 'mouse-test-product',
    brand: 'TestBrand',
    model: 'TestModel',
    category: 'mouse',
  };
}

function makeCategoryConfig() {
  return {
    category: 'mouse',
    fieldOrder: ['sensor_model', 'weight', 'dpi'],
    schema: { critical_fields: ['sensor_model', 'weight'] },
  };
}

function makeRoundContext() {
  return {
    missing_required_fields: ['sensor_model', 'weight'],
    missing_critical_fields: ['sensor_model'],
    round: 1,
  };
}

function makeHandoff() {
  return {
    queries: [
      {
        q: 'TestBrand TestModel sensor specs',
        query_hash: 'h1',
        family: 'manufacturer_html',
        group_key: 'sensor_performance',
        target_fields: ['sensor_model'],
        preferred_domains: [],
        exact_match_required: false,
      },
    ],
    query_hashes: ['h1'],
    total: 1,
  };
}

function makeStorage() {
  return {
    resolveOutputKey: () => '_learning/test',
    readJsonOrNull: async () => null,
  };
}

function stubNormalizeFieldList(fields) { return fields; }
function stubLoadSourceEntries() { return []; }

// WHY: After orchestrator rewrite, stages 02-08 run real implementations.
// These stubs return minimal valid shapes so the test focuses on schema4 wiring.
function makeStageStubs({ captureSearchPlannerArgs } = {}) {
  return {
    runBrandResolverFn: async () => ({ brandResolution: null, promotions: { hostEntries: [], registryEntries: {} } }),
    runSearchProfileFn: () => ({
      searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] },
    }),
    runSearchPlannerFn: async (args) => {
      if (captureSearchPlannerArgs) captureSearchPlannerArgs(args);
      return { enhancedRows: [], source: 'deterministic_fallback' };
    },
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
      selectedUrls: [],
      allCandidateUrls: [],
      candidates: [],
    }),
    runDomainClassifierFn: () => ({ enqueuedCount: 0, seededCount: 0 }),
  };
}

describe('runDiscoverySeedPlan Schema 4 wiring', () => {
  it('passes searchProfileBase to runSearchPlannerFn and attaches seed_search_plan_output when schema path enabled', async () => {
    let capturedPlannerArgs = null;
    let capturedJourneyArgs = null;

    const stubComputeNeedSet = () => ({
      schema_version: 'needset_output.v2.1',
      fields: [],
      summary: {},
      blockers: {},
      planner_seed: { missing_critical_fields: [], unresolved_fields: [], existing_queries: [], current_product_identity: {} },
    });

    const stubBuildContext = () => ({
      schema_version: 'search_planning_context.v2',
      focus_groups: [],
      run: {},
    });

    const schema4Output = {
      schema_version: 'needset_planner_output.v2',
      search_plan_handoff: makeHandoff(),
      planner: { mode: 'llm' },
      panel: { bundles: [{ queries: ['q1'] }] },
    };

    const stubBuildPlan = async () => schema4Output;

    const stageStubs = makeStageStubs({
      captureSearchPlannerArgs: (args) => { capturedPlannerArgs = args; },
    });

    // Override runQueryJourneyFn to capture its args
    stageStubs.runQueryJourneyFn = async (args) => {
      capturedJourneyArgs = args;
      return {
        queries: [],
        selectedQueryRowMap: new Map(),
        profileQueryRowsByQuery: new Map(),
        searchProfilePlanned: {},
        searchProfileKeys: {},
        executionQueryLimit: 0,
        queryLimit: 8,
        queryRejectLogCombined: [],
      };
    };

    const result = await runDiscoverySeedPlan({
      config: makeConfig(),
      storage: makeStorage(),
      category: 'mouse',
      categoryConfig: makeCategoryConfig(),
      job: makeJob(),
      runId: 'run-1',
      logger: { info: () => {}, warn: () => {} },
      roundContext: makeRoundContext(),
      requiredFields: [],
      llmContext: {},
      frontierDb: null,
      traceWriter: null,
      learningStoreHints: null,
      planner: { enqueue: () => {}, seedCandidates: () => {} },
      normalizeFieldListFn: stubNormalizeFieldList,
      loadEnabledSourceEntriesFn: stubLoadSourceEntries,
      computeNeedSetFn: stubComputeNeedSet,
      buildSearchPlanningContextFn: stubBuildContext,
      buildSearchPlanFn: stubBuildPlan,
      ...stageStubs,
    });

    assert.ok(capturedPlannerArgs, 'runSearchPlannerFn should have been called');
    assert.ok(capturedPlannerArgs.searchProfileBase, 'searchProfileBase should be passed to planner');
    assert.ok(capturedPlannerArgs.missingFields, 'missingFields should be passed to planner');

    assert.ok(capturedJourneyArgs, 'runQueryJourneyFn should have been called');
    assert.ok(Array.isArray(capturedJourneyArgs.enhancedRows), 'enhancedRows should be passed to journey');

    // seed_search_plan_output is attached to discoveryResult
    assert.ok(result.seed_search_plan_output, 'seed_search_plan_output should be attached');
    assert.equal(result.seed_search_plan_output.schema_version, 'needset_planner_output.v2');
  });

  it('planner still called when schema computation throws', async () => {
    let capturedArgs = null;
    const logs = [];

    const stubBuildPlan = async () => { throw new Error('Schema4 planner failed'); };

    const stageStubs = makeStageStubs({
      captureSearchPlannerArgs: (args) => { capturedArgs = args; },
    });

    await runDiscoverySeedPlan({
      config: makeConfig(),
      storage: makeStorage(),
      category: 'mouse',
      categoryConfig: makeCategoryConfig(),
      job: makeJob(),
      runId: 'run-3',
      logger: { info: () => {}, warn: (msg, data) => logs.push({ msg, data }) },
      roundContext: makeRoundContext(),
      requiredFields: [],
      llmContext: {},
      frontierDb: null,
      traceWriter: null,
      learningStoreHints: null,
      planner: { enqueue: () => {}, seedCandidates: () => {} },
      normalizeFieldListFn: stubNormalizeFieldList,
      loadEnabledSourceEntriesFn: stubLoadSourceEntries,
      computeNeedSetFn: () => ({ fields: [], planner_seed: {} }),
      buildSearchPlanningContextFn: () => ({ focus_groups: [] }),
      buildSearchPlanFn: stubBuildPlan,
      ...stageStubs,
    });

    assert.ok(capturedArgs, 'planner still called despite schema4 failure');
    assert.ok(capturedArgs.searchProfileBase, 'searchProfileBase passed to planner');
    assert.ok(logs.some(l => l.msg === 'search_plan_failed'), 'should log warning');
  });

  it('final result is a fresh object, not a mutated discoveryResult reference', async () => {
    let capturedDiscoveryResult = null;
    const stageStubs = makeStageStubs();
    stageStubs.processDiscoveryResultsFn = async () => {
      const dr = { enabled: true, selectedUrls: [], allCandidateUrls: [], candidates: [] };
      capturedDiscoveryResult = dr;
      return dr;
    };

    const result = await runDiscoverySeedPlan({
      config: makeConfig(),
      storage: makeStorage(),
      category: 'mouse',
      categoryConfig: makeCategoryConfig(),
      job: makeJob(),
      runId: 'run-immutable',
      logger: { info: () => {}, warn: () => {} },
      roundContext: makeRoundContext(),
      requiredFields: [],
      llmContext: {},
      frontierDb: null,
      traceWriter: null,
      learningStoreHints: null,
      planner: { enqueue: () => {}, seedCandidates: () => {} },
      normalizeFieldListFn: stubNormalizeFieldList,
      loadEnabledSourceEntriesFn: stubLoadSourceEntries,
      computeNeedSetFn: () => ({ fields: [], planner_seed: {} }),
      buildSearchPlanningContextFn: () => ({ focus_groups: [] }),
      buildSearchPlanFn: async () => ({ planner: { mode: 'disabled' } }),
      ...stageStubs,
    });

    assert.notEqual(result, capturedDiscoveryResult,
      'returned result should be a fresh object, not the mutated discoveryResult');
    assert.ok('enqueue_summary' in result, 'enqueue_summary attached to fresh result');
  });

  it('brand promotion adds official domain with default crawlConfig', async () => {
    let capturedCategoryConfig = null;
    const stageStubs = makeStageStubs();
    stageStubs.runSearchProfileFn = (args) => {
      capturedCategoryConfig = args.categoryConfig;
      return {
        searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] },
      };
    };

    await runDiscoverySeedPlan({
      config: makeConfig(),
      storage: makeStorage(),
      category: 'mouse',
      categoryConfig: makeCategoryConfig(),
      job: { ...makeJob(), brand: 'Razer', identityLock: { brand: 'Razer' } },
      runId: 'run-config',
      logger: { info: () => {}, warn: () => {} },
      roundContext: makeRoundContext(),
      requiredFields: [],
      llmContext: {},
      frontierDb: null,
      traceWriter: null,
      learningStoreHints: null,
      planner: { enqueue: () => {}, seedCandidates: () => {} },
      normalizeFieldListFn: stubNormalizeFieldList,
      loadEnabledSourceEntriesFn: stubLoadSourceEntries,
      computeNeedSetFn: () => ({ fields: [], planner_seed: {} }),
      buildSearchPlanningContextFn: () => ({ focus_groups: [] }),
      buildSearchPlanFn: async () => ({ planner: { mode: 'disabled' } }),
      ...stageStubs,
      // WHY: Override AFTER stageStubs so brand resolver returns a real domain for promotion.
      runNeedSetFn: async () => ({ focusGroups: [], seedStatus: null, seedSearchPlan: null }),
      runBrandResolverFn: async () => ({
        brandResolution: { officialDomain: 'razer.com', aliases: [], supportDomain: '', confidence: 0.9 },
      }),
    });

    // Brand promotion should have added razer.com entry with simplified crawlConfig
    const entry = capturedCategoryConfig?.sourceHosts?.find(h => h.host === 'razer.com');
    assert.ok(entry, 'razer.com should be promoted into sourceHosts');
    assert.equal(entry.crawlConfig.method, 'http',
      'crawlConfig.method should be http');
    assert.equal(entry.crawlConfig.robots_txt_compliant, true,
      'crawlConfig.robots_txt_compliant should be true');
  });

  it('planner called with searchProfileBase when buildSearchPlan returns no handoff', async () => {
    let capturedArgs = null;

    const stageStubs = makeStageStubs({
      captureSearchPlannerArgs: (args) => { capturedArgs = args; },
    });

    await runDiscoverySeedPlan({
      config: makeConfig(),
      storage: makeStorage(),
      category: 'mouse',
      categoryConfig: makeCategoryConfig(),
      job: makeJob(),
      runId: 'run-4',
      logger: { info: () => {}, warn: () => {} },
      roundContext: makeRoundContext(),
      requiredFields: [],
      llmContext: {},
      frontierDb: null,
      traceWriter: null,
      learningStoreHints: null,
      planner: { enqueue: () => {}, seedCandidates: () => {} },
      normalizeFieldListFn: stubNormalizeFieldList,
      loadEnabledSourceEntriesFn: stubLoadSourceEntries,
      computeNeedSetFn: () => ({ fields: [], planner_seed: {} }),
      buildSearchPlanningContextFn: () => ({ focus_groups: [] }),
      buildSearchPlanFn: async () => ({ planner: { mode: 'disabled' } }),
      ...stageStubs,
    });

    assert.ok(capturedArgs, 'planner called');
    assert.ok(capturedArgs.searchProfileBase, 'searchProfileBase passed to planner');
  });
});
