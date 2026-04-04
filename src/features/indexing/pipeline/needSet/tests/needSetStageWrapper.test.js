// WHY: Contract tests for the runNeedSet stage wrapper.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { runNeedSet } from '../runNeedSet.js';
import { computeNeedSet } from '../needsetEngine.js';
import { buildSearchPlanningContext } from '../searchPlanningContext.js';

function makeJob(overrides = {}) {
  return {
    productId: 'test-product-001',
    brand: 'TestBrand',
    base_model: 'TestModel',
    model: 'TestModel',
    aliases: [],
    identityLock: { brand: 'TestBrand', base_model: 'TestModel', model: 'TestModel' },
    ...overrides,
  };
}

function makeConfig() {
  return { searchProfileQueryCap: 10, discoveryEnabled: true };
}

function makeCategoryConfig() {
  return {
    category: 'mouse',
    fieldOrder: ['weight', 'sensor'],
    fieldRules: {},
    fieldGroups: {},
    sourceHosts: [],
  };
}

function makeRoundContext() {
  return {
    provenance: {},
    fieldReasoning: {},
    constraintAnalysis: {},
    identityContext: {},
    round: 0,
    previousFieldHistories: {},
  };
}

function makeNeedSetOutput() {
  return {
    schema_version: 'needset_output.v2.1',
    fields: [],
    summary: {},
    blockers: {},
    planner_seed: {
      missing_critical_fields: [],
      unresolved_fields: [],
      existing_queries: [],
      current_product_identity: {},
    },
    total_fields: 0,
    round: 0,
    rows: [],
    focus_fields: [],
    bundles: [],
    profile_mix: {},
    sorted_unresolved_keys: [],
    debug: {},
  };
}

function makePlanningContext() {
  return {
    schema_version: 'search_planning_context.v2.1',
    focus_groups: [{ key: 'g1', phase: 'now' }],
    seed_status: {
      query_completion_summary: {
        total_queries: 1,
        complete: 0,
        incomplete: 1,
      },
    },
  };
}

function makeSearchPlan() {
  return {
    schema_version: 'needset_planner_output.v2',
    search_plan_handoff: { queries: [], query_hashes: [], total: 0 },
    panel: null,
    planner: { mode: 'disabled' },
    learning_writeback: {},
  };
}

function makeEmptyNeedSetResult() {
  return {
    focusGroups: [],
    seedStatus: null,
    seedSearchPlan: null,
  };
}

function makeStubs(overrides = {}) {
  return {
    computeNeedSetFn: overrides.computeNeedSetFn || (() => makeNeedSetOutput()),
    buildSearchPlanningContextFn: overrides.buildSearchPlanningContextFn || (() => makePlanningContext()),
    buildSearchPlanFn: overrides.buildSearchPlanFn || (async () => makeSearchPlan()),
  };
}

function makeLoggerSpy() {
  const calls = [];
  return {
    calls,
    info: (event, payload) => calls.push({ level: 'info', event, payload }),
    warn: (event, payload) => calls.push({ level: 'warn', event, payload }),
    debug: (event, payload) => calls.push({ level: 'debug', event, payload }),
  };
}

function makeValidInput(overrides = {}) {
  return {
    config: makeConfig(),
    job: makeJob(),
    runId: 'run-001',
    category: 'mouse',
    categoryConfig: makeCategoryConfig(),
    roundContext: makeRoundContext(),
    llmContext: {},
    logger: makeLoggerSpy(),
    queryExecutionHistory: { queries: [] },
    ...makeStubs(overrides),
  };
}

function assertNeedSetResultContract(result) {
  ok(Array.isArray(result.focusGroups), 'focusGroups is array');
  ok(Object.hasOwn(result, 'seedStatus'), 'seedStatus exists');
  ok(Object.hasOwn(result, 'seedSearchPlan'), 'seedSearchPlan exists');
}

describe('runNeedSet input validation', { concurrency: false }, () => {
  it('accepts empty productId with default', async () => {
    const input = makeValidInput();
    input.job.productId = '';
    const result = await runNeedSet(input);
    ok(Array.isArray(result.focusGroups), 'runs with empty productId');
  });

  it('defaults missing runId to empty string', async () => {
    const input = makeValidInput();
    delete input.runId;
    const result = await runNeedSet(input);
    ok(Array.isArray(result.focusGroups), 'runs with missing runId');
  });

  it('defaults missing category to empty string', async () => {
    const input = makeValidInput();
    delete input.category;
    const result = await runNeedSet(input);
    ok(Array.isArray(result.focusGroups), 'runs with missing category');
  });

  it('accepts valid input and returns clean 3-field contract', async () => {
    const result = await runNeedSet(makeValidInput());
    assertNeedSetResultContract(result);
  });
});

describe('runNeedSet error handling', { concurrency: false }, () => {
  it('returns an empty contract when computeNeedSetFn throws', async () => {
    const input = makeValidInput({
      computeNeedSetFn: () => {
        throw new Error('engine exploded');
      },
    });

    const result = await runNeedSet(input);
    deepStrictEqual(result, makeEmptyNeedSetResult());
  });

  it('returns an empty contract when buildSearchPlanningContextFn throws', async () => {
    const input = makeValidInput({
      buildSearchPlanningContextFn: () => {
        throw new Error('context build failed');
      },
    });

    const result = await runNeedSet(input);
    deepStrictEqual(result, makeEmptyNeedSetResult());
  });
});

describe('runNeedSet public contract', { concurrency: false }, () => {
  function makeRealInput(overrides = {}) {
    return {
      config: { searchProfileQueryCap: 10, discoveryEnabled: true, searchEngines: 'bing' },
      job: makeJob(),
      runId: 'char-run-001',
      category: 'mouse',
      categoryConfig: {
        category: 'mouse',
        fieldOrder: ['weight', 'sensor_model', 'dpi_max'],
        fieldRules: {
          weight: { required_level: 'required', min_evidence_refs: 1 },
          sensor_model: { required_level: 'critical', min_evidence_refs: 2 },
          dpi_max: { required_level: 'required', min_evidence_refs: 1 },
        },
        fieldGroups: {},
        sourceHosts: [],
      },
      roundContext: {
        provenance: {},
        fieldReasoning: {},
        constraintAnalysis: {},
        identityContext: { status: 'locked', confidence: 0.99, identity_gate_validated: true },
        round: 0,
        previousFieldHistories: {},
      },
      llmContext: {},
      logger: makeLoggerSpy(),
      queryExecutionHistory: { queries: [] },
      computeNeedSetFn: computeNeedSet,
      buildSearchPlanningContextFn: buildSearchPlanningContext,
      buildSearchPlanFn: async () => makeSearchPlan(),
      ...overrides,
    };
  }

  it('focusGroups returns grouped unresolved fields', async () => {
    const result = await runNeedSet(makeRealInput());
    ok(Array.isArray(result.focusGroups), 'focusGroups is an array');
    ok(result.focusGroups.length > 0, 'focusGroups is not empty');
    ok(result.focusGroups.every((group) => typeof group.key === 'string'), 'each group has a key');
    ok(result.focusGroups.every((group) => Array.isArray(group.field_keys)), 'each group has field_keys');
    ok(result.focusGroups.some((group) => group.field_keys.includes('sensor_model')), 'unresolved fields are surfaced');
  });

  it('seedStatus exposes completion and seed state', async () => {
    const result = await runNeedSet(makeRealInput());
    ok(result.seedStatus, 'seedStatus exists');
    ok(result.seedStatus.query_completion_summary, 'query completion summary exists');
    strictEqual(typeof result.seedStatus.query_completion_summary.total_queries, 'number');
    ok(result.seedStatus.specs_seed, 'specs_seed exists');
    strictEqual(typeof result.seedStatus.specs_seed.is_needed, 'boolean');
    ok(result.seedStatus.brand_seed, 'brand_seed exists');
    strictEqual(typeof result.seedStatus.brand_seed.is_needed, 'boolean');
    ok(result.seedStatus.source_seeds && typeof result.seedStatus.source_seeds === 'object', 'source_seeds exists');
  });

  it('seedSearchPlan contains schema_version and search_plan_handoff', async () => {
    const result = await runNeedSet(makeRealInput());
    const sp = result.seedSearchPlan;
    ok(sp, 'seedSearchPlan is non-null');
    strictEqual(sp.schema_version, 'needset_planner_output.v2');
    ok(sp.search_plan_handoff !== undefined, 'search_plan_handoff exists');
  });

  it('seedSearchPlan.search_plan_handoff carries query data', async () => {
    const input = makeRealInput({
      buildSearchPlanFn: async () => ({
        schema_version: 'needset_planner_output.v2',
        search_plan_handoff: { queries: [{ query: 'test' }], query_hashes: ['h1'], total: 1 },
        panel: { round: 0, identity: {}, summary: {}, blockers: {}, bundles: [], profile_influence: {}, deltas: [] },
        planner: { mode: 'llm' },
        learning_writeback: { queries_generated: 1 },
      }),
    });

    const result = await runNeedSet(input);
    ok(result.seedSearchPlan, 'seedSearchPlan is non-null');
    ok(result.seedSearchPlan.search_plan_handoff, 'search_plan_handoff exists');
    strictEqual(result.seedSearchPlan.search_plan_handoff.queries.length, 1);
    strictEqual(result.seedSearchPlan.search_plan_handoff._planner.mode, 'llm');
    ok(result.seedSearchPlan.search_plan_handoff._learning, '_learning attached');
  });
});
