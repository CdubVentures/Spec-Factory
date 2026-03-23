// WHY: Characterization tests for pipeline orchestrator data flow.
// Locks down: both stages called, data flows to Stage 03, promotions applied,
// full pipeline returns valid result. Then adds parallel overlap proof.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runDiscoverySeedPlan } from '../src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js';

function makeConfig(overrides = {}) {
  return { discoveryEnabled: true, searchEngines: 'bing,google', maxCandidateUrls: 10, ...overrides };
}

function makeJob() {
  return { productId: 'test-prod', brand: 'TestBrand', model: 'TestModel', category: 'mouse' };
}

function makeCategoryConfig() {
  return {
    category: 'mouse',
    fieldOrder: ['sensor_model', 'weight'],
    schema: { critical_fields: ['sensor_model'] },
  };
}

function makeRoundContext() {
  return { missing_required_fields: ['sensor_model'], missing_critical_fields: ['sensor_model'], round: 0 };
}

function makeStorage() {
  return { resolveOutputKey: () => '_learning/test', readJsonOrNull: async () => null };
}

const STUB_NEEDSET_RETURN = Object.freeze({
  focusGroups: [{ key: 'test_group', label: 'Test', group_search_worthy: true }],
  seedStatus: { specs_seed: { is_needed: true } },
  seedSearchPlan: null,
});

const STUB_BRAND_RETURN = Object.freeze({
  brandResolution: { officialDomain: 'testbrand.com', aliases: [], supportDomain: '', confidence: 0.8, reasoning: [] },
});

function makeStageStubs(overrides = {}) {
  return {
    runNeedSetFn: overrides.runNeedSetFn || (async () => ({ ...STUB_NEEDSET_RETURN })),
    runBrandResolverFn: overrides.runBrandResolverFn || (async () => JSON.parse(JSON.stringify(STUB_BRAND_RETURN))),
    runSearchProfileFn: overrides.runSearchProfileFn || (() => ({
      searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] },
      effectiveHostPlan: null, hostPlanQueryRows: [],
    })),
    runSearchPlannerFn: overrides.runSearchPlannerFn || (async () => ({ enhancedRows: [], source: 'deterministic_fallback' })),
    runQueryJourneyFn: overrides.runQueryJourneyFn || (async () => ({
      queries: [], selectedQueryRowMap: new Map(), profileQueryRowsByQuery: new Map(),
      searchProfilePlanned: {}, searchProfileKeys: {}, executionQueryLimit: 0,
      queryLimit: 8, queryRejectLogCombined: [],
    })),
    executeSearchQueriesFn: overrides.executeSearchQueriesFn || (async () => ({
      rawResults: [], searchAttempts: [], searchJournal: [],
      internalSatisfied: false, externalSearchReason: null,
    })),
    processDiscoveryResultsFn: overrides.processDiscoveryResultsFn || (async () => ({
      enabled: true, selectedUrls: [], allCandidateUrls: [], candidates: [],
    })),
    runDomainClassifierFn: overrides.runDomainClassifierFn || (() => ({ enqueuedCount: 0, seededCount: 0 })),
  };
}

function makeBaseArgs(stageOverrides = {}) {
  const stubs = makeStageStubs(stageOverrides);
  return {
    config: makeConfig(), job: makeJob(), runId: 'test-run',
    category: 'mouse', categoryConfig: makeCategoryConfig(),
    roundContext: makeRoundContext(), storage: makeStorage(),
    logger: null, llmContext: {}, frontierDb: null, traceWriter: null,
    learningStoreHints: {}, planner: null,
    normalizeFieldListFn: (f) => f,
    loadEnabledSourceEntriesFn: () => [],
    computeNeedSetFn: () => ({ schema_version: 'needset_output.v2.1', fields: [], summary: {}, blockers: {}, planner_seed: { missing_critical_fields: [], unresolved_fields: [], existing_queries: [], current_product_identity: {} } }),
    buildSearchPlanningContextFn: () => ({ schema_version: 'search_planning_context.v2', focus_groups: [], run: {} }),
    buildSearchPlanFn: async () => null,
    resolveBrandDomainFn: async () => ({ officialDomain: '', aliases: [], supportDomain: '', confidence: 0, reasoning: [] }),
    ...stubs,
  };
}

describe('Pipeline orchestrator — characterization', { concurrency: false }, () => {

  it('#1 both NeedSet and Brand Resolver are called', async () => {
    let needSetCalled = false;
    let brandCalled = false;

    await runDiscoverySeedPlan(makeBaseArgs({
      runNeedSetFn: async (args) => {
        needSetCalled = true;
        assert.ok(args.config, 'NeedSet receives config');
        assert.ok(args.job, 'NeedSet receives job');
        return { ...STUB_NEEDSET_RETURN };
      },
      runBrandResolverFn: async (args) => {
        brandCalled = true;
        assert.ok(args.job, 'Brand receives job');
        assert.ok(args.category, 'Brand receives category');
        return JSON.parse(JSON.stringify(STUB_BRAND_RETURN));
      },
    }));

    assert.ok(needSetCalled, 'NeedSet was called');
    assert.ok(brandCalled, 'Brand Resolver was called');
  });

  it('#2 Stage 03 receives focusGroups from NeedSet and brandResolution from Brand', async () => {
    let capturedProfileArgs = null;

    await runDiscoverySeedPlan(makeBaseArgs({
      runSearchProfileFn: (args) => {
        capturedProfileArgs = args;
        return { searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] }, effectiveHostPlan: null, hostPlanQueryRows: [] };
      },
    }));

    assert.ok(capturedProfileArgs, 'runSearchProfileFn was called');
    assert.deepStrictEqual(capturedProfileArgs.focusGroups, STUB_NEEDSET_RETURN.focusGroups);
    assert.equal(capturedProfileArgs.brandResolution.officialDomain, 'testbrand.com');
  });

  it('#3 brand promotions applied to categoryConfig before Stage 03', async () => {
    let profileCategoryConfig = null;

    await runDiscoverySeedPlan(makeBaseArgs({
      runSearchProfileFn: (args) => {
        profileCategoryConfig = args.categoryConfig;
        return { searchProfileBase: { base_templates: [], queries: [], query_rows: [], query_reject_log: [] }, effectiveHostPlan: null, hostPlanQueryRows: [] };
      },
    }));

    assert.ok(profileCategoryConfig, 'Stage 03 received categoryConfig');
    assert.ok(profileCategoryConfig.sourceHostMap instanceof Map, 'sourceHostMap is a Map');
    assert.ok(profileCategoryConfig.sourceHostMap.has('testbrand.com'), 'promoted host is in sourceHostMap');
  });

  it('#4 stages 01 and 02 run in parallel (overlap)', async () => {
    let needSetStart = 0, needSetEnd = 0;
    let brandStart = 0, brandEnd = 0;

    await runDiscoverySeedPlan(makeBaseArgs({
      runNeedSetFn: async (args) => {
        needSetStart = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        needSetEnd = Date.now();
        return { ...STUB_NEEDSET_RETURN };
      },
      runBrandResolverFn: async (args) => {
        brandStart = Date.now();
        await new Promise((r) => setTimeout(r, 40));
        brandEnd = Date.now();
        return JSON.parse(JSON.stringify(STUB_BRAND_RETURN));
      },
    }));

    // Parallel: brand should start BEFORE needSet finishes
    assert.ok(brandStart > 0, 'Brand Resolver was called');
    assert.ok(needSetStart > 0, 'NeedSet was called');
    assert.ok(brandStart < needSetEnd, `Brand started (${brandStart}) before NeedSet finished (${needSetEnd}) — parallel execution`);
  });

  it('#5 full pipeline returns discoveryResult with enqueue_summary', async () => {
    const result = await runDiscoverySeedPlan(makeBaseArgs());

    assert.ok(result, 'pipeline returned a result');
    assert.ok('enqueue_summary' in result, 'result has enqueue_summary');
    assert.equal(result.enabled, true);
  });
});
