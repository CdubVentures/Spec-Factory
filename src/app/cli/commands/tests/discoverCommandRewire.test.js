// WHY: Characterization test proving runDiscoverySeedPlan returns the shape
// discoverCommand.js needs (candidatesKey + candidates[]) when called with
// the parameter mapping the discover command will use after rewiring.

import test from 'node:test';
import assert from 'node:assert/strict';

import { runDiscoverySeedPlan } from '../../../../features/indexing/pipeline/orchestration/runDiscoverySeedPlan.js';

function makeConfig() {
  return {
    discoveryEnabled: true,
    searchEngines: 'bing,google',
    maxCandidateUrls: 10,
    fetchCandidateSources: true,
  };
}

function makeStorage() {
  return {
    resolveOutputKey: () => '_learning/test',
    readJsonOrNull: async () => null,
  };
}

function makeCategoryConfig() {
  return {
    category: 'mouse',
    fieldOrder: ['sensor_model', 'weight'],
    schema: { critical_fields: ['sensor_model'] },
  };
}

function makeJob() {
  return {
    productId: 'test-product',
    brand: 'TestBrand',
    model: 'TestModel',
    category: 'mouse',
  };
}

function makeStageStubs() {
  return {
    computeNeedSetFn: () => ({
      fields: [],
      summary: {},
      blockers: {},
      identity: { manufacturer: 'TestBrand', model: 'TestModel' },
      planner_seed: { missing_critical_fields: [], unresolved_fields: [], existing_queries: [] },
    }),
    buildSearchPlanningContextFn: ({ needSetOutput }) => ({
      schema_version: 'search_planning_context.v2.1',
      run: { run_id: 'test-run', category: 'mouse', product_id: 'test-product', brand: 'TestBrand', model: 'TestModel', base_model: '', aliases: [], round: 0 },
      identity: needSetOutput?.identity || null,
      needset: { summary: {}, blockers: {}, missing_critical_fields: [], unresolved_fields: [], existing_queries: [] },
      planner_limits: {},
      group_catalog: {},
      focus_groups: [],
      field_priority_map: {},
      learning: null,
      previous_round_fields: null,
      seed_status: { specs_seed: { is_needed: false }, brand_seed: { is_needed: false }, source_seeds: {} },
      pass_seed: {},
      tier_allocation: null,
    }),
    buildSearchPlanFn: async () => ({
      schema_version: 'needset_planner_output.v2',
      planner: { mode: 'disabled', planner_complete: true },
      search_plan_handoff: { queries: [], query_hashes: [], total: 0 },
      panel: { round: 0, identity: null, summary: {}, blockers: {}, bundles: [], profile_influence: {}, deltas: [] },
      learning_writeback: {},
    }),
    runBrandResolverFn: async () => ({ brandResolution: null, promotions: { hostEntries: [], registryEntries: {} } }),
    runSearchProfileFn: () => ({
      searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] },
    }),
    runSearchPlannerFn: async () => ({ enhancedRows: [], source: 'deterministic_fallback' }),
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
      candidatesKey: 'test/candidates.json',
      candidates: [{ url: 'https://example.com/product' }],
      selectedUrls: ['https://example.com/product'],
      allCandidateUrls: ['https://example.com/product'],
    }),
    runDomainClassifierFn: () => ({ enqueuedCount: 0, seededCount: 0 }),
  };
}

test('runDiscoverySeedPlan returns candidatesKey and candidates when called with discover-command params', async () => {
  const result = await runDiscoverySeedPlan({
    config: makeConfig(),
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: makeCategoryConfig(),
    job: makeJob(),
    runId: 'test-run',
    logger: null,
    roundContext: {
      missing_critical_fields: ['sensor_model'],
    },
    normalizeFieldListFn: (fields) => fields,
    ...makeStageStubs(),
  });

  assert.equal(typeof result.candidatesKey, 'string', 'result must have candidatesKey as string');
  assert.ok(Array.isArray(result.candidates), 'result must have candidates as array');
  assert.ok(result.candidates.length > 0, 'candidates array should contain stubbed entries');
  assert.equal(result.candidatesKey, 'test/candidates.json');
});

test('runDiscoverySeedPlan return shape includes enqueue_summary from domain classifier', async () => {
  const result = await runDiscoverySeedPlan({
    config: makeConfig(),
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: makeCategoryConfig(),
    job: makeJob(),
    runId: 'test-run',
    logger: null,
    roundContext: {},
    normalizeFieldListFn: (fields) => fields,
    ...makeStageStubs(),
  });

  assert.ok(result.enqueue_summary != null, 'result must have enqueue_summary');
  assert.equal(result.enabled, true, 'result must have enabled flag from discoveryResult');
});
