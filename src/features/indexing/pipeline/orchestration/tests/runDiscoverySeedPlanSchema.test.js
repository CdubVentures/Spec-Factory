import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runDiscoverySeedPlan } from '../runDiscoverySeedPlan.js';

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

function makeLogger() {
  return {
    info() {},
    warn() {},
    flush: async () => {},
  };
}

function makePlanner() {
  return {
    enqueue() {},
    seedCandidates() {},
  };
}

function stubNormalizeFieldList(fields) {
  return fields;
}

function makeSearchProfileBase() {
  return {
    base_templates: [],
    queries: [],
    query_rows: [],
    query_reject_log: [],
  };
}

function makeJourney() {
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
}

function makeSearchResult() {
  return {
    rawResults: [],
    searchAttempts: [],
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: null,
  };
}

function makeDiscoveryResult(overrides = {}) {
  return {
    enabled: true,
    selectedUrls: [],
    allCandidateUrls: [],
    candidates: [],
    ...overrides,
  };
}

function makeStageStubs(overrides = {}) {
  return {
    runBrandResolverFn: async () => ({ brandResolution: null, promotions: { hostEntries: [], registryEntries: {} } }),
    runSearchProfileFn: () => ({ searchProfileBase: makeSearchProfileBase() }),
    runSearchPlannerFn: async () => ({ enhancedRows: [], source: 'deterministic_fallback' }),
    runQueryJourneyFn: async () => makeJourney(),
    executeSearchQueriesFn: async () => makeSearchResult(),
    processDiscoveryResultsFn: async () => makeDiscoveryResult(),
    runDomainClassifierFn: () => ({ enqueuedCount: 0, seededCount: 0 }),
    ...overrides,
  };
}

function makeSearchPlanOutput(overrides = {}) {
  return {
    schema_version: 'needset_planner_output.v2',
    search_plan_handoff: makeHandoff(),
    planner: { mode: 'llm' },
    panel: { bundles: [{ queries: ['q1'] }] },
    ...overrides,
  };
}

function makeRunArgs(overrides = {}) {
  return {
    config: makeConfig(),
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: makeCategoryConfig(),
    job: makeJob(),
    runId: 'run-schema-test',
    logger: makeLogger(),
    roundContext: makeRoundContext(),
    requiredFields: [],
    llmContext: {},
    frontierDb: null,
    traceWriter: null,
    learningStoreHints: null,
    planner: makePlanner(),
    normalizeFieldListFn: stubNormalizeFieldList,
    computeNeedSetFn: () => ({ fields: [], planner_seed: {} }),
    buildSearchPlanningContextFn: () => ({ focus_groups: [] }),
    buildSearchPlanFn: async () => makeSearchPlanOutput(),
    ...makeStageStubs(),
    ...overrides,
  };
}

describe('runDiscoverySeedPlan schema return contract', () => {
  it('attaches seed_search_plan_output when the schema path yields a search plan handoff', async () => {
    const result = await runDiscoverySeedPlan(makeRunArgs({
      runId: 'run-with-handoff',
      buildSearchPlanFn: async () => makeSearchPlanOutput(),
    }));

    assert.ok(result.seed_search_plan_output, 'seed_search_plan_output should be attached');
    assert.equal(result.seed_search_plan_output.schema_version, 'needset_planner_output.v2');
    assert.equal(result.seed_search_plan_output.search_plan_handoff.total, 1);
    assert.equal(result.seed_search_plan_output.search_plan_handoff.queries.length, 1);
    assert.deepEqual(result.enqueue_summary, { enqueuedCount: 0, seededCount: 0 });
  });

  it('returns the discovery result contract without seed_search_plan_output when schema computation fails', async () => {
    const result = await runDiscoverySeedPlan(makeRunArgs({
      runId: 'run-schema-failed',
      buildSearchPlanFn: async () => { throw new Error('Search-plan planner failed'); },
    }));

    assert.deepEqual(result.enabled, true);
    assert.deepEqual(result.selectedUrls, []);
    assert.deepEqual(result.allCandidateUrls, []);
    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.enqueue_summary, { enqueuedCount: 0, seededCount: 0 });
    assert.equal(Object.hasOwn(result, 'seed_search_plan_output'), false);
  });

  it('returns seed_search_plan_output and enqueue_summary when the planner disables handoff generation', async () => {
    const result = await runDiscoverySeedPlan(makeRunArgs({
      runId: 'run-no-handoff',
      buildSearchPlanFn: async () => ({ planner: { mode: 'disabled' } }),
    }));

    assert.ok(result.seed_search_plan_output, 'seed_search_plan_output should remain attached');
    assert.equal(result.seed_search_plan_output.planner.mode, 'disabled');
    assert.equal(Object.hasOwn(result.seed_search_plan_output, 'search_plan_handoff'), false);
    assert.deepEqual(result.enqueue_summary, { enqueuedCount: 0, seededCount: 0 });
  });
});
