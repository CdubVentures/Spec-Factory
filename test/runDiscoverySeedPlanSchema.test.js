// WHY: Tests the Schema 2→3→4 computation wiring in runDiscoverySeedPlan.
// When config enables it and LLM is available, Schema 4 search_plan_handoff
// is computed BEFORE discovery and passed to discoverCandidateSources.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runDiscoverySeedPlan } from '../src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js';

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
    bundle_hints: [],
    round: 1,
    round_mode: 'seed',
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
    runBrandResolverFn: async () => ({ brandResolution: null, promotedHosts: [] }),
    runSearchProfileFn: () => ({
      searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] },
      effectiveHostPlan: null,
      hostPlanQueryRows: [],
    }),
    runSearchPlannerFn: async (args) => {
      if (captureSearchPlannerArgs) captureSearchPlannerArgs(args);
      return { schema4Plan: null, uberSearchPlan: null };
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
      approvedUrls: [],
      candidateUrls: [],
      candidates: [],
    }),
    runDomainClassifierFn: () => ({ enqueuedCount: 0, seededCount: 0 }),
  };
}

describe('runDiscoverySeedPlan Schema 4 wiring', () => {
  it('passes searchPlanHandoff to discoverCandidateSourcesFn and attaches seed_search_plan_output when schema path enabled', async () => {
    const handoff = makeHandoff();
    let capturedArgs = null;

    const stubComputeNeedSet = () => ({
      schema_version: 'needset_output.v2',
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
      search_plan_handoff: handoff,
      planner: { mode: 'llm' },
      panel: { bundles: [{ queries: ['q1'] }] },
    };

    const stubBuildPlan = async () => schema4Output;

    const stageStubs = makeStageStubs({
      captureSearchPlannerArgs: (args) => { capturedArgs = args; },
    });

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

    assert.ok(capturedArgs, 'discoverCandidateSourcesFn should have been called');
    assert.ok(capturedArgs.searchPlanHandoff, 'searchPlanHandoff should be passed');
    assert.equal(capturedArgs.searchPlanHandoff.queries.length, 1);
    assert.equal(capturedArgs.searchPlanHandoff.queries[0].q, 'TestBrand TestModel sensor specs');

    // seed_search_plan_output is attached to discoveryResult
    assert.ok(result.seed_search_plan_output, 'seed_search_plan_output should be attached');
    assert.equal(result.seed_search_plan_output.schema_version, 'needset_planner_output.v2');
  });

  it('passes null handoff when schema computation throws', async () => {
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

    assert.ok(capturedArgs);
    assert.equal(capturedArgs.searchPlanHandoff, null, 'handoff should be null on error');
    assert.ok(logs.some(l => l.msg === 'schema4_computation_failed'), 'should log warning');
  });

  it('passes null handoff when buildSearchPlan returns no handoff', async () => {
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

    assert.ok(capturedArgs);
    assert.equal(capturedArgs.searchPlanHandoff, null, 'no handoff when planner disabled');
  });
});
