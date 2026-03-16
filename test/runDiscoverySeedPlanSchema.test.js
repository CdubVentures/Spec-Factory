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
    searchProvider: 'dual',
    maxCandidateUrls: 10,
    fetchCandidateSources: true,
    enableSchema4SearchPlan: true,
    llmEnabled: true,
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

function stubNormalizeFieldList(fields) { return fields; }
function stubLoadSourceEntries() { return []; }

describe('runDiscoverySeedPlan Schema 4 wiring', () => {
  it('passes searchPlanHandoff to discoverCandidateSourcesFn when schema path enabled', async () => {
    const handoff = makeHandoff();
    let capturedArgs = null;

    const stubDiscover = async (args) => {
      capturedArgs = args;
      return {
        enabled: true,
        approvedUrls: [],
        candidateUrls: [],
        queries: ['TestBrand TestModel sensor specs'],
      };
    };

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

    const stubBuildPlan = async () => ({
      schema_version: 'needset_planner_output.v2',
      search_plan_handoff: handoff,
      planner: { mode: 'llm' },
    });

    await runDiscoverySeedPlan({
      config: makeConfig(),
      storage: {},
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
      discoverCandidateSourcesFn: stubDiscover,
      computeNeedSetFn: stubComputeNeedSet,
      buildSearchPlanningContextFn: stubBuildContext,
      buildSearchPlanFn: stubBuildPlan,
    });

    assert.ok(capturedArgs, 'discoverCandidateSourcesFn should have been called');
    assert.ok(capturedArgs.searchPlanHandoff, 'searchPlanHandoff should be passed');
    assert.equal(capturedArgs.searchPlanHandoff.queries.length, 1);
    assert.equal(capturedArgs.searchPlanHandoff.queries[0].q, 'TestBrand TestModel sensor specs');
  });

  it('passes null handoff when enableSchema4SearchPlan is false', async () => {
    let capturedArgs = null;

    const stubDiscover = async (args) => {
      capturedArgs = args;
      return { enabled: true, approvedUrls: [], candidateUrls: [], queries: [] };
    };

    await runDiscoverySeedPlan({
      config: makeConfig({ enableSchema4SearchPlan: false }),
      storage: {},
      category: 'mouse',
      categoryConfig: makeCategoryConfig(),
      job: makeJob(),
      runId: 'run-2',
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
      discoverCandidateSourcesFn: stubDiscover,
    });

    assert.ok(capturedArgs);
    assert.equal(capturedArgs.searchPlanHandoff, null, 'handoff should be null when disabled');
  });

  it('passes null handoff when schema computation throws', async () => {
    let capturedArgs = null;
    const logs = [];

    const stubDiscover = async (args) => {
      capturedArgs = args;
      return { enabled: true, approvedUrls: [], candidateUrls: [], queries: [] };
    };

    const stubComputeNeedSet = () => { throw new Error('NeedSet computation failed'); };

    await runDiscoverySeedPlan({
      config: makeConfig(),
      storage: {},
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
      discoverCandidateSourcesFn: stubDiscover,
      computeNeedSetFn: stubComputeNeedSet,
      buildSearchPlanningContextFn: () => ({}),
      buildSearchPlanFn: async () => ({}),
    });

    assert.ok(capturedArgs);
    assert.equal(capturedArgs.searchPlanHandoff, null, 'handoff should be null on error');
    assert.ok(logs.some(l => l.msg === 'schema4_computation_failed'), 'should log warning');
  });

  it('passes null handoff when buildSearchPlan returns no handoff', async () => {
    let capturedArgs = null;

    const stubDiscover = async (args) => {
      capturedArgs = args;
      return { enabled: true, approvedUrls: [], candidateUrls: [], queries: [] };
    };

    await runDiscoverySeedPlan({
      config: makeConfig(),
      storage: {},
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
      discoverCandidateSourcesFn: stubDiscover,
      computeNeedSetFn: () => ({ fields: [], planner_seed: {} }),
      buildSearchPlanningContextFn: () => ({ focus_groups: [] }),
      buildSearchPlanFn: async () => ({ planner: { mode: 'disabled' } }),
    });

    assert.ok(capturedArgs);
    assert.equal(capturedArgs.searchPlanHandoff, null, 'no handoff when planner disabled');
  });
});
