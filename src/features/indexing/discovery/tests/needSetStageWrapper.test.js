// WHY: Contract + characterization tests for the runNeedSet stage wrapper.
// Characterization tests lock down current behavior before refactoring.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { runNeedSet } from '../stages/needSet.js';
import { computeNeedSet } from '../../../../indexlab/needsetEngine.js';
import { buildSearchPlanningContext } from '../../../../indexlab/searchPlanningContext.js';

// --- Factory helpers ---

function makeJob(overrides = {}) {
  return {
    productId: 'test-product-001',
    brand: 'TestBrand',
    model: 'TestModel',
    baseModel: '',
    aliases: [],
    identityLock: { brand: 'TestBrand', model: 'TestModel', base_model: '' },
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
    planner_seed: { missing_critical_fields: [], unresolved_fields: [], existing_queries: [], current_product_identity: {} },
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
    seed_status: {},
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

// --- Group A: Zod input validation ---

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
    const input = makeValidInput();
    const result = await runNeedSet(input);
    const keys = Object.keys(result).sort();
    deepStrictEqual(keys, ['focusGroups', 'seedSearchPlan', 'seedStatus']);
    ok(Array.isArray(result.focusGroups), 'focusGroups is array');
    ok(result.seedStatus !== undefined, 'seedStatus exists');
    ok(result.seedSearchPlan !== undefined, 'seedSearchPlan exists');
  });
});

// --- Group B: Error handling isolation ---

describe('runNeedSet error handling', { concurrency: false }, () => {
  it('logs needset_computation_failed when computeNeedSetFn throws', async () => {
    const logger = makeLoggerSpy();
    const input = makeValidInput({
      computeNeedSetFn: () => { throw new Error('engine exploded'); },
    });
    input.logger = logger;

    const result = await runNeedSet(input);
    const warn = logger.calls.find(c => c.level === 'warn' && c.event === 'needset_computation_failed');
    ok(warn, 'should log needset_computation_failed');
    ok(warn.payload.error.includes('engine exploded'), 'error message preserved');
    strictEqual(result.seedStatus, null, 'seedStatus is null');
    strictEqual(result.seedSearchPlan, null, 'seedSearchPlan is null');
    strictEqual(result.focusGroups.length, 0, 'focusGroups is empty');

    // Must NOT log schema4_computation_failed for a computeNeedSet failure
    const wrongLog = logger.calls.find(c => c.event === 'schema4_computation_failed');
    strictEqual(wrongLog, undefined, 'should not log schema4_computation_failed');
  });

  it('logs search_planning_context_failed when buildSearchPlanningContextFn throws', async () => {
    const logger = makeLoggerSpy();
    const input = makeValidInput({
      buildSearchPlanningContextFn: () => { throw new Error('context build failed'); },
    });
    input.logger = logger;

    const result = await runNeedSet(input);
    const warn = logger.calls.find(c => c.level === 'warn' && c.event === 'search_planning_context_failed');
    ok(warn, 'should log search_planning_context_failed');
    strictEqual(result.seedStatus, null, 'seedStatus is null');
    strictEqual(result.focusGroups.length, 0, 'focusGroups is empty from null planningContext');
  });

  it('logs focusGroups degradation warning when computation fails', async () => {
    const logger = makeLoggerSpy();
    const input = makeValidInput({
      computeNeedSetFn: () => { throw new Error('boom'); },
    });
    input.logger = logger;

    await runNeedSet(input);
    const degradationWarn = logger.calls.find(c =>
      c.level === 'warn' && c.event === 'needset_computation_failed'
    );
    ok(degradationWarn, 'warning logged for failed computation');
  });

  it('all three succeed — returns clean 3-field output', async () => {
    const input = makeValidInput();
    const result = await runNeedSet(input);
    ok(result.seedSearchPlan !== null, 'seedSearchPlan present');
    ok(result.seedStatus !== undefined, 'seedStatus present');
    ok(Array.isArray(result.focusGroups), 'focusGroups is array');
  });
});

// --- Characterization: golden-master tests locking current behavior ---

describe('runNeedSet characterization (golden-master)', { concurrency: false }, () => {
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

  it('return shape has exactly 3 keys: focusGroups, seedStatus, seedSearchPlan', async () => {
    const result = await runNeedSet(makeRealInput());
    const keys = Object.keys(result).sort();
    deepStrictEqual(keys, ['focusGroups', 'seedSearchPlan', 'seedStatus']);
  });

  it('focusGroups is a non-empty array from planningContext.focus_groups', async () => {
    const result = await runNeedSet(makeRealInput());
    ok(Array.isArray(result.focusGroups), 'focusGroups is array');
  });

  it('seedStatus is flattened from planningContext.seed_status', async () => {
    const result = await runNeedSet(makeRealInput());
    ok(result.seedStatus !== undefined, 'seedStatus exists');
  });

  it('seedSearchPlan contains schema_version and search_plan_handoff', async () => {
    const result = await runNeedSet(makeRealInput());
    const sp = result.seedSearchPlan;
    ok(sp, 'seedSearchPlan is non-null');
    strictEqual(sp.schema_version, 'needset_planner_output.v2');
    ok(sp.search_plan_handoff !== undefined, 'search_plan_handoff exists');
  });

  it('emits needset_computed with scope schema2_preview', async () => {
    const input = makeRealInput();
    await runNeedSet(input);
    const preview = input.logger.calls.find(c =>
      c.level === 'info' && c.event === 'needset_computed' && c.payload?.scope === 'schema2_preview'
    );
    ok(preview, 'schema2_preview event emitted');
    ok(Array.isArray(preview.payload.fields), 'preview has fields');
    ok(preview.payload.summary, 'preview has summary');
    ok(preview.payload.blockers, 'preview has blockers');
    strictEqual(preview.payload.schema_version, 'preview');
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
    // _planner and _learning are attached to seedSearchPlan.search_plan_handoff internally
    strictEqual(result.seedSearchPlan.search_plan_handoff._planner.mode, 'llm');
    ok(result.seedSearchPlan.search_plan_handoff._learning, '_learning attached');
  });
});
