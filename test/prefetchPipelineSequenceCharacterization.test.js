// WHY: Characterization tests for the 8-stage prefetch pipeline decomposition.
// These verify that stages are called in correct sequential order and that
// data flows correctly between stages.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runDiscoverySeedPlan } from '../src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeLogger() {
  const events = [];
  return {
    events,
    info(name, data) { events.push({ level: 'info', event: name, data }); },
    warn(name, data) { events.push({ level: 'warn', event: name, data }); },
  };
}

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
    productId: 'mouse-test-brand-test-model',
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
    round: 0,
    round_mode: 'seed',
  };
}

function makeSchema2() {
  return {
    schema_version: 'needset_output.v2',
    fields: [
      { field_key: 'sensor_model', state: 'missing', need_score: 0.95 },
      { field_key: 'weight', state: 'missing', need_score: 0.90 },
    ],
    summary: { total: 3, resolved: 1, core_total: 2, core_resolved: 0 },
    blockers: { missing: 2, weak: 0, conflict: 0 },
    planner_seed: {
      identity: { brand: 'TestBrand', model: 'TestModel' },
      missing_critical_fields: ['sensor_model'],
      unresolved_fields: ['sensor_model', 'weight'],
    },
  };
}

function makeSchema3() {
  return {
    schema_version: 'search_planning_context.v2',
    focus_groups: [
      { key: 'manufacturer_html', phase: 'now', core_unresolved_count: 2 },
    ],
    run: { run_id: 'run-char', category: 'mouse' },
  };
}

function makeSchema4WithHandoff() {
  return {
    schema_version: 'needset_planner_output.v2',
    planner: { mode: 'standard' },
    search_plan_handoff: {
      queries: [
        { q: 'TestBrand TestModel specifications', family: 'manufacturer_html', target_fields: ['sensor_model'] },
        { q: 'TestBrand TestModel weight dimensions', family: 'manufacturer_html', target_fields: ['weight'] },
      ],
      query_hashes: ['h1', 'h2'],
      total: 2,
    },
    panel: {
      round: 0,
      round_mode: 'seed',
      bundles: [{ key: 'manufacturer_html', queries: [{ q: 'q1' }] }],
      deltas: [],
      profile_influence: {},
    },
    learning_writeback: null,
  };
}

function makeSchema4Empty() {
  return {
    schema_version: 'needset_planner_output.v2',
    planner: { mode: 'standard' },
    search_plan_handoff: { queries: [], query_hashes: [], total: 0 },
    panel: null,
    learning_writeback: null,
  };
}

function makeDiscoveryResult(overrides = {}) {
  return {
    enabled: true,
    approvedUrls: ['https://testbrand.com/testmodel'],
    candidateUrls: ['https://review-site.com/testmodel'],
    candidates: [
      {
        url: 'https://testbrand.com/testmodel',
        original_url: 'https://testbrand.com/testmodel',
        identity_prelim: 'match',
        host_trust_class: 'manufacturer',
        doc_kind_guess: 'product_page',
        primary_lane: 'manufacturer',
        triage_disposition: 'fetch_high',
        approval_bucket: 'approved',
        score: 0.95,
      },
      {
        url: 'https://review-site.com/testmodel',
        original_url: 'https://review-site.com/testmodel',
        identity_prelim: 'likely',
        host_trust_class: 'lab',
        doc_kind_guess: 'review',
        primary_lane: 'review',
        triage_disposition: 'fetch_normal',
        approval_bucket: 'candidate',
        score: 0.72,
      },
    ],
    queries: ['TestBrand TestModel specifications'],
    ...overrides,
  };
}

function stubNormalizeFieldList(fields) { return fields; }
function stubLoadSourceEntries() { return []; }

// WHY: The orchestrator calls loadLearningArtifacts which needs storage methods.
function makeStorage() {
  return {
    resolveOutputKey: () => '_learning/mouse',
    readJsonOrNull: async () => null,
  };
}

// ---------------------------------------------------------------------------
// Stage call-order tracker
// ---------------------------------------------------------------------------

function createCallOrderTracker() {
  let counter = 0;
  const calls = [];
  return {
    calls,
    track(label) { calls.push({ label, order: counter++ }); },
    orderOf(label) {
      const entry = calls.find((c) => c.label === label);
      return entry ? entry.order : -1;
    },
  };
}

// ---------------------------------------------------------------------------
// Stage stubs — each returns minimal valid output
// ---------------------------------------------------------------------------

function makeNeedSetResult(overrides = {}) {
  return {
    schema2: makeSchema2(),
    schema3: makeSchema3(),
    seedSchema4: makeSchema4WithHandoff(),
    searchPlanHandoff: makeSchema4WithHandoff().search_plan_handoff,
    focusGroups: [{ key: 'manufacturer_html', phase: 'now', core_unresolved_count: 2 }],
    ...overrides,
  };
}

function makeBrandResult(overrides = {}) {
  return {
    brandResolution: { officialDomain: 'testbrand.com', aliases: [], supportDomain: '', confidence: 0.9, reasoning: [] },
    promotedHosts: [],
    ...overrides,
  };
}

function makeSearchProfileResult() {
  return {
    searchProfileBase: { base_templates: [], queries: [], query_rows: [] },
    effectiveHostPlan: null,
    hostPlanQueryRows: [],
  };
}

function makeSearchPlannerResult() {
  return { schema4Plan: null, uberSearchPlan: null };
}

function makeQueryJourneyResult() {
  return {
    queries: ['TestBrand TestModel specifications'],
    selectedQueryRowMap: new Map(),
    profileQueryRowsByQuery: new Map(),
    searchProfilePlanned: {},
    searchProfileKeys: { inputKey: '', runKey: '', latestKey: '' },
    executionQueryLimit: 8,
    queryLimit: 8,
    queryRejectLogCombined: [],
  };
}

function makeSearchResult() {
  return {
    rawResults: [],
    searchAttempts: 0,
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: 'normal',
  };
}

// Common base args used by all tests — stages stubbed to prevent real I/O
function makeBaseArgs(overrides = {}) {
  return {
    config: makeConfig(),
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: makeCategoryConfig(),
    job: makeJob(),
    runId: 'run-char-1',
    logger: makeLogger(),
    roundContext: makeRoundContext(),
    requiredFields: [],
    llmContext: {},
    frontierDb: null,
    traceWriter: null,
    learningStoreHints: null,
    planner: { enqueue: () => {}, seedCandidates: () => {}, enqueueCounters: { total: 0 } },
    normalizeFieldListFn: stubNormalizeFieldList,
    loadEnabledSourceEntriesFn: stubLoadSourceEntries,
    // Stage DI seams — all stubbed by default
    runNeedSetFn: async () => makeNeedSetResult(),
    runBrandResolverFn: async () => makeBrandResult(),
    runSearchProfileFn: () => makeSearchProfileResult(),
    runSearchPlannerFn: async () => makeSearchPlannerResult(),
    runQueryJourneyFn: async () => makeQueryJourneyResult(),
    executeSearchQueriesFn: async () => makeSearchResult(),
    processDiscoveryResultsFn: async () => makeDiscoveryResult(),
    runDomainClassifierFn: () => ({ enqueuedCount: 1, seededCount: 1 }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Prefetch pipeline sequence characterization', () => {

  describe('8-stage sequential ordering', () => {

    it('stages are called in strict sequence: NeedSet → Brand → Profile → Planner → Journey → Search → Results → Classifier', async () => {
      const tracker = createCallOrderTracker();

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-seq-1',
        runNeedSetFn: async (args) => {
          tracker.track('needSet');
          return makeNeedSetResult();
        },
        runBrandResolverFn: async (args) => {
          tracker.track('brandResolver');
          return makeBrandResult();
        },
        runSearchProfileFn: (args) => {
          tracker.track('searchProfile');
          return makeSearchProfileResult();
        },
        runSearchPlannerFn: async (args) => {
          tracker.track('searchPlanner');
          return makeSearchPlannerResult();
        },
        runQueryJourneyFn: async (args) => {
          tracker.track('queryJourney');
          return makeQueryJourneyResult();
        },
        executeSearchQueriesFn: async (args) => {
          tracker.track('executeSearch');
          return makeSearchResult();
        },
        processDiscoveryResultsFn: async (args) => {
          tracker.track('processResults');
          return makeDiscoveryResult();
        },
        runDomainClassifierFn: (args) => {
          tracker.track('domainClassifier');
          return { enqueuedCount: 1, seededCount: 1 };
        },
      }));

      assert.equal(tracker.calls.length, 8, 'exactly 8 stages called');
      assert.ok(tracker.orderOf('needSet') < tracker.orderOf('brandResolver'),
        'NeedSet before Brand Resolver');
      assert.ok(tracker.orderOf('brandResolver') < tracker.orderOf('searchProfile'),
        'Brand Resolver before Search Profile');
      assert.ok(tracker.orderOf('searchProfile') < tracker.orderOf('searchPlanner'),
        'Search Profile before Search Planner');
      assert.ok(tracker.orderOf('searchPlanner') < tracker.orderOf('queryJourney'),
        'Search Planner before Query Journey');
      assert.ok(tracker.orderOf('queryJourney') < tracker.orderOf('executeSearch'),
        'Query Journey before Search Execution');
      assert.ok(tracker.orderOf('executeSearch') < tracker.orderOf('processResults'),
        'Search Execution before Result Processing');
      assert.ok(tracker.orderOf('processResults') < tracker.orderOf('domainClassifier'),
        'Result Processing before Domain Classifier');
    });

    it('NeedSet stage receives computeNeedSetFn, buildSearchPlanningContextFn, buildSearchPlanFn', async () => {
      let capturedArgs = null;

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-seq-2',
        computeNeedSetFn: () => makeSchema2(),
        buildSearchPlanningContextFn: () => makeSchema3(),
        buildSearchPlanFn: async () => makeSchema4WithHandoff(),
        runNeedSetFn: async (args) => {
          capturedArgs = args;
          return makeNeedSetResult();
        },
      }));

      assert.equal(typeof capturedArgs.computeNeedSetFn, 'function');
      assert.equal(typeof capturedArgs.buildSearchPlanningContextFn, 'function');
      assert.equal(typeof capturedArgs.buildSearchPlanFn, 'function');
    });
  });

  describe('needset_computed and schema4_handoff_ready events', () => {

    it('needset_computed emitted by runNeedSet stage with panel data and fields', async () => {
      const logger = makeLogger();

      // Use the real runNeedSet stage (not stubbed) since it emits the events
      const { runNeedSet } = await import('../src/features/indexing/discovery/stages/needSet.js');

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-event-1',
        logger,
        runNeedSetFn: (args) => runNeedSet({
          ...args,
          computeNeedSetFn: () => makeSchema2(),
          buildSearchPlanningContextFn: () => makeSchema3(),
          buildSearchPlanFn: async () => makeSchema4WithHandoff(),
        }),
      }));

      // WHY: needSet.js now emits two needset_computed events — a schema2_preview
      // early, then the full schema4_planner one after the LLM call completes.
      const needsetEvents = logger.events.filter((e) => e.event === 'needset_computed');
      assert.ok(needsetEvents.length >= 1, 'at least one needset_computed emitted');
      const schema4Event = needsetEvents.find((e) => e.data.scope === 'schema4_planner');
      assert.ok(schema4Event, 'schema4_planner needset_computed emitted');
      assert.equal(schema4Event.data.schema_version, 'needset_planner_output.v2');
      assert.ok(Array.isArray(schema4Event.data.fields), 'fields array present');
      assert.ok(schema4Event.data.planner_seed, 'planner_seed present');
      assert.ok(Array.isArray(schema4Event.data.bundles), 'bundles from panel present');
    });

    it('schema4_handoff_ready emitted when handoff has queries', async () => {
      const logger = makeLogger();
      const { runNeedSet } = await import('../src/features/indexing/discovery/stages/needSet.js');

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-event-2',
        logger,
        runNeedSetFn: (args) => runNeedSet({
          ...args,
          computeNeedSetFn: () => makeSchema2(),
          buildSearchPlanningContextFn: () => makeSchema3(),
          buildSearchPlanFn: async () => makeSchema4WithHandoff(),
        }),
      }));

      const eventNames = logger.events.map((e) => e.event);
      assert.ok(eventNames.includes('needset_computed'), 'needset_computed emitted');
      assert.ok(eventNames.includes('schema4_handoff_ready'), 'schema4_handoff_ready emitted');
      const needsetIdx = eventNames.indexOf('needset_computed');
      const handoffIdx = eventNames.indexOf('schema4_handoff_ready');
      assert.ok(needsetIdx < handoffIdx, 'needset_computed fires before schema4_handoff_ready');
    });
  });

  describe('NeedSet output flows to downstream stages', () => {

    it('searchPlanHandoff from NeedSet is passed to SearchPlanner stage', async () => {
      let capturedPlannerArgs = null;
      const handoff = makeSchema4WithHandoff().search_plan_handoff;
      handoff._planner = { mode: 'standard' };
      handoff._learning = null;
      handoff._panel = makeSchema4WithHandoff().panel;

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-flow-1',
        runNeedSetFn: async () => makeNeedSetResult({ searchPlanHandoff: handoff }),
        runSearchPlannerFn: async (args) => {
          capturedPlannerArgs = args;
          return makeSearchPlannerResult();
        },
      }));

      assert.ok(capturedPlannerArgs.searchPlanHandoff, 'handoff passed to planner');
      assert.equal(capturedPlannerArgs.searchPlanHandoff.queries.length, 2);
    });

    it('focusGroups from NeedSet schema3 flow to Search Profile stage', async () => {
      let capturedProfileArgs = null;

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-flow-2',
        runSearchProfileFn: (args) => {
          capturedProfileArgs = args;
          return makeSearchProfileResult();
        },
      }));

      assert.ok(Array.isArray(capturedProfileArgs.focusGroups), 'focusGroups passed as array');
      assert.equal(capturedProfileArgs.focusGroups.length, 1);
      assert.equal(capturedProfileArgs.focusGroups[0].key, 'manufacturer_html');
    });

    it('seedSchema4 is attached to discoveryResult', async () => {
      const result = await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-flow-3',
      }));

      assert.ok(result.seed_search_plan_output, 'schema4 output attached');
      assert.equal(result.seed_search_plan_output.schema_version, 'needset_planner_output.v2');
    });
  });

  describe('Brand Resolver stage', () => {

    it('brandResolution from Brand stage flows to SearchProfile and downstream', async () => {
      let capturedProfileArgs = null;
      const brandResult = makeBrandResult({
        brandResolution: { officialDomain: 'testbrand.com', aliases: ['tb.com'], supportDomain: '', confidence: 0.95, reasoning: [] },
      });

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-brand-1',
        runBrandResolverFn: async () => brandResult,
        runSearchProfileFn: (args) => {
          capturedProfileArgs = args;
          return makeSearchProfileResult();
        },
      }));

      assert.ok(capturedProfileArgs.brandResolution, 'brandResolution passed to profile');
      assert.equal(capturedProfileArgs.brandResolution.officialDomain, 'testbrand.com');
    });

    it('brand resolution failure is non-fatal — null brandResolution flows downstream', async () => {
      let capturedProfileArgs = null;
      const logger = makeLogger();

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-brand-2',
        logger,
        runBrandResolverFn: async () => makeBrandResult({ brandResolution: null }),
        runSearchProfileFn: (args) => {
          capturedProfileArgs = args;
          return makeSearchProfileResult();
        },
      }));

      assert.equal(capturedProfileArgs.brandResolution, null, 'null brandResolution on failure');
    });
  });

  describe('Domain Classifier (Stage 08) — planner enqueue', () => {

    it('approved URLs enqueued as discovery_approved', async () => {
      const enqueued = [];
      const seeded = [];

      const planner = {
        enqueue(url, reason, opts) { enqueued.push({ url, reason, opts }); },
        seedCandidates(urls, opts) { seeded.push({ urls, opts }); },
        enqueueCounters: { total: 0 },
      };

      // Use real domain classifier to test enqueue behavior
      const { runDomainClassifier } = await import('../src/features/indexing/discovery/stages/domainClassifier.js');

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-domain-1',
        planner,
        runDomainClassifierFn: (args) => runDomainClassifier(args),
      }));

      assert.equal(enqueued.length, 1);
      assert.equal(enqueued[0].url, 'https://testbrand.com/testmodel');
      assert.equal(enqueued[0].reason, 'discovery_approved');
      assert.equal(enqueued[0].opts.forceApproved, true);

      assert.equal(seeded.length, 1);
      assert.deepEqual(seeded[0].urls, ['https://review-site.com/testmodel']);
    });

    it('candidate seeding skipped when fetchCandidateSources is false', async () => {
      const seeded = [];
      const planner = {
        enqueue() {},
        seedCandidates(urls) { seeded.push(...urls); },
        enqueueCounters: { total: 0 },
      };

      const { runDomainClassifier } = await import('../src/features/indexing/discovery/stages/domainClassifier.js');

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-domain-2',
        config: makeConfig({ fetchCandidateSources: false }),
        planner,
        runDomainClassifierFn: (args) => runDomainClassifier(args),
      }));

      assert.equal(seeded.length, 0, 'no candidate seeding when disabled');
    });
  });

  describe('discoveryConfig invariants', () => {

    it('discoveryEnabled forced true and searchEngines defaulted', async () => {
      let capturedConfig = null;

      await runDiscoverySeedPlan(makeBaseArgs({
        runId: 'run-config-1',
        config: makeConfig({ discoveryEnabled: false, searchEngines: '' }),
        executeSearchQueriesFn: async (args) => {
          capturedConfig = args.config;
          return makeSearchResult();
        },
      }));

      assert.equal(capturedConfig.discoveryEnabled, true, 'discoveryEnabled forced true');
      assert.equal(capturedConfig.searchEngines, 'bing,google', 'searchEngines defaulted');
    });
  });
});
