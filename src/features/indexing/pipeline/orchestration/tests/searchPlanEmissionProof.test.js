import test from 'node:test';
import assert from 'node:assert/strict';

import { runDiscoverySeedPlan } from '../runDiscoverySeedPlan.js';

// ---------------------------------------------------------------------------
// Realistic NeedSet output (needsetEngine.computeNeedSet return shape)
// ---------------------------------------------------------------------------

function makeNeedSetFixture() {
  return {
    schema_version: 'needset_output.v2',
    run_id: 'run-searchplan-proof',
    category: 'mouse',
    product_id: 'mouse-razer-viper-v3-pro',
    round: 0,
    identity: { state: 'locked', confidence: 0.95, brand: 'Razer', model: 'Viper V3 Pro' },
    fields: [
      { field_key: 'weight', required_level: 'required', state: 'missing', need_score: 0.95, bundle: 'manufacturer_html', search_hints: { query_terms: ['weight grams'] } },
      { field_key: 'dimensions', required_level: 'required', state: 'missing', need_score: 0.90, bundle: 'manufacturer_html', search_hints: { query_terms: ['dimensions mm'] } },
      { field_key: 'sensor', required_level: 'required', state: 'weak', need_score: 0.72, bundle: 'manufacturer_html', search_hints: { query_terms: ['sensor model'] } },
      { field_key: 'dpi', required_level: 'required', state: 'accepted', need_score: 0, bundle: 'manufacturer_html', search_hints: {} },
      { field_key: 'polling_rate', required_level: 'secondary', state: 'missing', need_score: 0.65, bundle: 'manual_pdf', search_hints: {} },
      { field_key: 'click_latency', required_level: 'optional', state: 'missing', need_score: 0.40, bundle: 'review_lookup', search_hints: {} },
      { field_key: 'lod', required_level: 'optional', state: 'accepted', need_score: 0, bundle: 'manufacturer_html', search_hints: {} },
      { field_key: 'cable_type', required_level: 'secondary', state: 'missing', need_score: 0.55, bundle: 'support_docs', search_hints: {} },
      { field_key: 'switch_type', required_level: 'secondary', state: 'missing', need_score: 0.60, bundle: 'manufacturer_html', search_hints: {} },
      { field_key: 'battery_life', required_level: 'secondary', state: 'weak', need_score: 0.50, bundle: 'review_lookup', search_hints: {} },
      { field_key: 'weight_with_dongle', required_level: 'optional', state: 'missing', need_score: 0.30, bundle: 'benchmark_lookup', search_hints: {} },
      { field_key: 'scroll_type', required_level: 'optional', state: 'accepted', need_score: 0, bundle: 'manufacturer_html', search_hints: {} },
    ],
    planner_seed: {
      identity: { brand: 'Razer', model: 'Viper V3 Pro', aliases: ['RZ01-0490'] },
      product_class: 'gaming_mouse',
      dominant_source_family: 'manufacturer_html',
    },
    summary: {
      total: 12,
      resolved: 4,
      core_total: 4,
      core_resolved: 1,
      secondary_total: 4,
      secondary_resolved: 0,
      optional_total: 4,
      optional_resolved: 2,
    },
    blockers: { missing: 6, weak: 2, conflict: 0 },
    bundles: [],
    profile_mix: {},
    total_fields: 12,
    needset_size: 8,
  };
}

// ---------------------------------------------------------------------------
// Realistic Search Plan output (searchPlanBuilder.buildSearchPlan return shape)
// ---------------------------------------------------------------------------

function makeSearchPlanFixture() {
  return {
    schema_version: 'needset_planner_output.v2',
    run: { run_id: 'run-searchplan-proof', category: 'mouse', product_id: 'mouse-razer-viper-v3-pro', round: 0 },
    planner: { mode: 'standard' },
    search_plan_handoff: {
      queries: [
        { q: 'Razer Viper V3 Pro specifications', family: 'manufacturer_html' },
        { q: 'Razer Viper V3 Pro weight dimensions sensor', family: 'manufacturer_html' },
        { q: 'Razer Viper V3 Pro tech specs features', family: 'manufacturer_html' },
        { q: 'site:razer.com Viper V3 Pro', family: 'manufacturer_html' },
        { q: 'site:razer.com Viper V3 Pro support', family: 'manufacturer_html' },
        { q: 'site:razer.com Viper V3 Pro FAQ', family: 'manufacturer_html' },
        { q: 'site:razer.com Viper V3 Pro product page', family: 'manufacturer_html' },
        { q: 'site:razer.com Viper V3 Pro datasheet', family: 'manufacturer_html' },
        { q: 'Razer Viper V3 Pro user manual PDF', family: 'manual_pdf' },
        { q: 'Razer Viper V3 Pro quick start guide', family: 'manual_pdf' },
        { q: 'Razer Viper V3 Pro support page', family: 'support_docs' },
        { q: 'Razer Viper V3 Pro FAQ specifications', family: 'support_docs' },
        { q: 'Razer Viper V3 Pro support downloads', family: 'support_docs' },
        { q: 'Razer Viper V3 Pro rtings review', family: 'review_lookup' },
        { q: 'Razer Viper V3 Pro techpowerup review', family: 'review_lookup' },
        { q: 'Razer Viper V3 Pro mouse review measurements', family: 'review_lookup' },
        { q: 'Razer Viper V3 Pro hardware review latency', family: 'review_lookup' },
        { q: 'Razer Viper V3 Pro review click latency test', family: 'review_lookup' },
        { q: 'Razer Viper V3 Pro review battery life test', family: 'review_lookup' },
        { q: 'Razer Viper V3 Pro benchmark mouse', family: 'benchmark_lookup' },
        { q: 'Razer Viper V3 Pro sensor performance benchmark', family: 'benchmark_lookup' },
        { q: 'Razer Viper V3 Pro gaming mouse comparison', family: 'fallback_web' },
      ],
      query_hashes: [],
      total: 22,
    },
    panel: {
      round: 0,
      identity: { state: 'locked', confidence: 0.95, brand: 'Razer', model: 'Viper V3 Pro' },
      summary: {
        total: 12,
        resolved: 4,
        core_total: 4,
        core_resolved: 1,
        secondary_total: 4,
        secondary_resolved: 0,
        optional_total: 4,
        optional_resolved: 2,
      },
      blockers: { missing: 6, weak: 2, conflict: 0 },
      bundles: [
        {
          key: 'manufacturer_html',
          label: 'Manufacturer HTML',
          desc: 'Official product page and spec data',
          source_target: 'razer.com',
          content_target: 'product_page',
          search_intent: 'spec_lookup',
          host_class: 'manufacturer',
          phase: 'now',
          priority: 'core',
          queries: [
            { q: 'Razer Viper V3 Pro specifications', family: 'manufacturer_html' },
            { q: 'Razer Viper V3 Pro weight dimensions sensor', family: 'manufacturer_html' },
            { q: 'Razer Viper V3 Pro tech specs features', family: 'manufacturer_html' },
            { q: 'site:razer.com Viper V3 Pro', family: 'manufacturer_html' },
            { q: 'site:razer.com Viper V3 Pro support', family: 'manufacturer_html' },
            { q: 'site:razer.com Viper V3 Pro FAQ', family: 'manufacturer_html' },
            { q: 'site:razer.com Viper V3 Pro product page', family: 'manufacturer_html' },
            { q: 'site:razer.com Viper V3 Pro datasheet', family: 'manufacturer_html' },
          ],
          query_family_mix: { manufacturer_html: 8 },
          reason_active: 'missing core fields require manufacturer source',
          fields: [
            { field_key: 'weight', state: 'missing', need_score: 0.95 },
            { field_key: 'dimensions', state: 'missing', need_score: 0.90 },
            { field_key: 'sensor', state: 'weak', need_score: 0.72 },
            { field_key: 'switch_type', state: 'missing', need_score: 0.60 },
          ],
        },
        {
          key: 'manual_pdf',
          label: 'Manual PDF',
          desc: 'User manual and quick start guide',
          source_target: 'support.razer.com',
          content_target: 'manual',
          search_intent: 'spec_lookup',
          host_class: 'support',
          phase: 'now',
          priority: 'secondary',
          queries: [
            { q: 'Razer Viper V3 Pro user manual PDF', family: 'manual_pdf' },
            { q: 'Razer Viper V3 Pro quick start guide', family: 'manual_pdf' },
          ],
          query_family_mix: { manual_pdf: 2 },
          reason_active: 'manual expected to contain polling_rate detail',
          fields: [
            { field_key: 'polling_rate', state: 'missing', need_score: 0.65 },
          ],
        },
        {
          key: 'support_docs',
          label: 'Support Docs',
          desc: 'Support pages, FAQ, downloads',
          source_target: 'support.razer.com',
          content_target: 'support',
          search_intent: 'spec_lookup',
          host_class: 'support',
          phase: 'now',
          priority: 'secondary',
          queries: [
            { q: 'Razer Viper V3 Pro support page', family: 'support_docs' },
            { q: 'Razer Viper V3 Pro FAQ specifications', family: 'support_docs' },
            { q: 'Razer Viper V3 Pro support downloads', family: 'support_docs' },
          ],
          query_family_mix: { support_docs: 3 },
          reason_active: 'cable_type details in support documentation',
          fields: [
            { field_key: 'cable_type', state: 'missing', need_score: 0.55 },
          ],
        },
        {
          key: 'review_lookup',
          label: 'Lab Review',
          desc: 'Professional lab measurement data',
          source_target: 'rtings.com',
          content_target: 'review',
          search_intent: 'measurement_data',
          host_class: 'lab_review',
          phase: 'now',
          priority: 'secondary',
          queries: [
            { q: 'Razer Viper V3 Pro rtings review', family: 'review_lookup' },
            { q: 'Razer Viper V3 Pro techpowerup review', family: 'review_lookup' },
            { q: 'Razer Viper V3 Pro mouse review measurements', family: 'review_lookup' },
            { q: 'Razer Viper V3 Pro hardware review latency', family: 'review_lookup' },
            { q: 'Razer Viper V3 Pro review click latency test', family: 'review_lookup' },
            { q: 'Razer Viper V3 Pro review battery life test', family: 'review_lookup' },
          ],
          query_family_mix: { review_lookup: 6 },
          reason_active: 'click_latency and battery_life measurements from lab review',
          fields: [
            { field_key: 'click_latency', state: 'missing', need_score: 0.40 },
            { field_key: 'battery_life', state: 'weak', need_score: 0.50 },
          ],
        },
        {
          key: 'benchmark_lookup',
          label: 'Benchmark',
          desc: 'Sensor performance benchmarks',
          source_target: '',
          content_target: 'benchmark',
          search_intent: 'performance_data',
          host_class: 'benchmark',
          phase: 'next',
          priority: 'optional',
          queries: [
            { q: 'Razer Viper V3 Pro benchmark mouse', family: 'benchmark_lookup' },
            { q: 'Razer Viper V3 Pro sensor performance benchmark', family: 'benchmark_lookup' },
          ],
          query_family_mix: { benchmark_lookup: 2 },
          reason_active: 'weight_with_dongle sometimes in benchmark data',
          fields: [
            { field_key: 'weight_with_dongle', state: 'missing', need_score: 0.30 },
          ],
        },
        {
          key: 'fallback_web',
          label: 'Fallback Web',
          desc: 'General web comparison pages',
          source_target: '',
          content_target: 'comparison',
          search_intent: 'general_lookup',
          host_class: 'web',
          phase: 'next',
          priority: 'optional',
          queries: [
            { q: 'Razer Viper V3 Pro gaming mouse comparison', family: 'fallback_web' },
          ],
          query_family_mix: { fallback_web: 1 },
          reason_active: 'fallback coverage for unfilled fields',
          fields: [],
        },
      ],
      profile_influence: {
        manufacturer_html: 8,
        manual_pdf: 2,
        support_docs: 3,
        review_lookup: 6,
        benchmark_lookup: 2,
        fallback_web: 1,
        targeted_single: 0,
        duplicates_suppressed: 4,
        focused_bundles: 6,
        targeted_exceptions: 1,
        total_queries: 22,
        trusted_host_share: 11,
        docs_manual_share: 2,
      },
      deltas: [
        { field: 'dpi', from: 'missing', to: 'accepted' },
        { field: 'weight', from: 'weak', to: 'missing' },
        { field: 'sensor', from: 'missing', to: 'weak' },
      ],
    },
    learning_writeback: {
      query_hashes_generated: [],
      queries_generated: [],
      families_used: ['benchmark_lookup', 'fallback_web', 'manual_pdf', 'manufacturer_html', 'review_lookup', 'support_docs'],
      domains_targeted: ['razer.com', 'support.razer.com', 'rtings.com'],
      groups_activated: ['core_specs', 'manual_docs', 'lab_reviews', 'benchmarks'],
      duplicates_suppressed: 4,
    },
  };
}

// ---------------------------------------------------------------------------
// Logger spy — captures all info/warn calls
// ---------------------------------------------------------------------------

function makeLoggerSpy() {
  const calls = [];
  return {
    calls,
    info(event, payload) { calls.push({ level: 'info', event, payload }); },
    warn(event, payload) { calls.push({ level: 'warn', event, payload }); },
    debug(event, payload) { calls.push({ level: 'debug', event, payload }); },
  };
}

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeStorage() {
  return {
    resolveOutputKey: () => '_learning/test',
    readJsonOrNull: async () => null,
  };
}

function makePlanner() {
  const enqueued = [];
  const seeded = [];
  return {
    enqueued,
    seeded,
    enqueue(url, reason, opts) { enqueued.push({ url, reason, opts }); },
    seedCandidates(urls) { seeded.push(...urls); },
  };
}

// WHY: After orchestrator rewrite, stages 02-08 run real implementations.
// These stubs return minimal valid shapes so the test focuses on NeedSet emission.
function makeStageStubs() {
  return {
    runBrandResolverFn: async () => ({ brandResolution: null, promotedHosts: [] }),
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
      searchResults: [],
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

// =========================================================================
// TEST SUITE
// =========================================================================

test('runDiscoverySeedPlan emits needset_computed with profile_influence, bundles, deltas', async () => {
  const logger = makeLoggerSpy();
  const needSetOutput = makeNeedSetFixture();
  const searchPlan = makeSearchPlanFixture();
  const planner = makePlanner();

  await runDiscoverySeedPlan({
    config: {

      searchEngines: 'bing,brave,duckduckgo',
      discoveryEnabled: true,
      maxCandidateUrls: 10,
      fetchCandidateSources: false,
    },
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: {
      category: 'mouse',
      fieldOrder: needSetOutput.fields.map((f) => f.field_key),
      fieldGroups: {},
    },
    job: { productId: 'mouse-razer-viper-v3-pro', brand: 'Razer', model: 'Viper V3 Pro', aliases: ['RZ01-0490'] },
    runId: 'run-searchplan-proof',
    logger,
    roundContext: {},
    requiredFields: ['weight', 'sensor', 'dpi'],
    llmContext: {},
    planner,
    normalizeFieldListFn: (list) => (Array.isArray(list) ? list : []),

    computeNeedSetFn: () => needSetOutput,
    buildSearchPlanningContextFn: (args) => ({ ...args, context_ready: true }),
    buildSearchPlanFn: async () => searchPlan,
    ...makeStageStubs(),
  });

  // WHY: needSet.js now emits two needset_computed events — a needset_assessment
  // early, then the full search_plan one after the LLM call completes.
  const needsetCalls = logger.calls.filter(
    (c) => c.level === 'info' && c.event === 'needset_computed',
  );
  const searchPlanCalls = needsetCalls.filter((c) => c.payload?.scope === 'search_plan');
  assert.equal(searchPlanCalls.length, 1, 'exactly one search_plan needset_computed emitted');

  const payload = searchPlanCalls[0].payload;

  // -- scope and schema_version --
  assert.equal(payload.scope, 'search_plan', 'scope must be search_plan');
  assert.equal(payload.schema_version, 'needset_planner_output.v2', 'schema_version from Search Plan');

  // -- profile_influence (every family count) --
  assert.ok(payload.profile_influence, 'profile_influence must exist');
  assert.equal(payload.profile_influence.manufacturer_html, 8);
  assert.equal(payload.profile_influence.manual_pdf, 2);
  assert.equal(payload.profile_influence.support_docs, 3);
  assert.equal(payload.profile_influence.review_lookup, 6);
  assert.equal(payload.profile_influence.benchmark_lookup, 2);
  assert.equal(payload.profile_influence.fallback_web, 1);
  assert.equal(payload.profile_influence.total_queries, 22);
  assert.equal(payload.profile_influence.focused_bundles, 6);
  assert.equal(payload.profile_influence.duplicates_suppressed, 4);
  assert.equal(payload.profile_influence.targeted_exceptions, 1);
  assert.equal(payload.profile_influence.trusted_host_share, 11);
  assert.equal(payload.profile_influence.docs_manual_share, 2);

  // -- bundles (6 bundles, each with queries, phase, priority) --
  assert.ok(Array.isArray(payload.bundles), 'bundles must be array');
  assert.equal(payload.bundles.length, 6, '6 bundles total');

  // manufacturer_html bundle
  const mfr = payload.bundles.find((b) => b.key === 'manufacturer_html');
  assert.ok(mfr, 'manufacturer_html bundle exists');
  assert.equal(mfr.phase, 'now');
  assert.equal(mfr.priority, 'core');
  assert.equal(mfr.queries.length, 8, '8 manufacturer queries');
  assert.equal(mfr.queries[0].q, 'Razer Viper V3 Pro specifications');
  assert.equal(mfr.queries[0].family, 'manufacturer_html');
  assert.equal(mfr.host_class, 'manufacturer');
  assert.equal(mfr.source_target, 'razer.com');
  assert.equal(mfr.fields.length, 4);

  // manual_pdf bundle
  const manual = payload.bundles.find((b) => b.key === 'manual_pdf');
  assert.ok(manual, 'manual_pdf bundle exists');
  assert.equal(manual.phase, 'now');
  assert.equal(manual.priority, 'secondary');
  assert.equal(manual.queries.length, 2);

  // support_docs bundle
  const support = payload.bundles.find((b) => b.key === 'support_docs');
  assert.ok(support, 'support_docs bundle exists');
  assert.equal(support.queries.length, 3);

  // review_lookup bundle
  const review = payload.bundles.find((b) => b.key === 'review_lookup');
  assert.ok(review, 'review_lookup bundle exists');
  assert.equal(review.queries.length, 6);
  assert.equal(review.priority, 'secondary');

  // benchmark_lookup bundle
  const bench = payload.bundles.find((b) => b.key === 'benchmark_lookup');
  assert.ok(bench, 'benchmark_lookup bundle exists');
  assert.equal(bench.queries.length, 2);
  assert.equal(bench.phase, 'next');
  assert.equal(bench.priority, 'optional');

  // fallback_web bundle
  const fallback = payload.bundles.find((b) => b.key === 'fallback_web');
  assert.ok(fallback, 'fallback_web bundle exists');
  assert.equal(fallback.queries.length, 1);

  // -- deltas --
  assert.ok(Array.isArray(payload.deltas), 'deltas must be array');
  assert.equal(payload.deltas.length, 3);
  const dpiDelta = payload.deltas.find((d) => d.field === 'dpi');
  assert.ok(dpiDelta, 'dpi delta exists');
  assert.equal(dpiDelta.from, 'missing');
  assert.equal(dpiDelta.to, 'accepted');
  const sensorDelta = payload.deltas.find((d) => d.field === 'sensor');
  assert.ok(sensorDelta, 'sensor delta exists');
  assert.equal(sensorDelta.from, 'missing');
  assert.equal(sensorDelta.to, 'weak');

  // -- fields from NeedSet --
  assert.ok(Array.isArray(payload.fields), 'fields must be array');
  assert.equal(payload.fields.length, 12, 'all 12 fields from NeedSet');
  assert.equal(payload.fields[0].field_key, 'weight');
  assert.equal(payload.fields[3].field_key, 'dpi');
  assert.equal(payload.fields[3].state, 'accepted');

  // -- planner_seed from NeedSet --
  assert.ok(payload.planner_seed, 'planner_seed must exist');
  assert.equal(payload.planner_seed.identity.brand, 'Razer');
  assert.equal(payload.planner_seed.product_class, 'gaming_mouse');

  // -- summary and blockers from panel --
  assert.ok(payload.summary, 'summary must exist');
  assert.equal(payload.summary.total, 12);
  assert.equal(payload.summary.resolved, 4);
  assert.ok(payload.blockers, 'blockers must exist');
  assert.equal(payload.blockers.missing, 6);
  assert.equal(payload.blockers.weak, 2);

  // -- identity from panel --
  assert.ok(payload.identity, 'identity must exist');
  assert.equal(payload.identity.state, 'locked');

  // WHY: search_plan_ready no longer emitted — _planner/_learning/_panel
  // attachment removed in Search Planner redesign. needset_computed still fires.
});

test('runDiscoverySeedPlan handles search-plan computation failure gracefully', async () => {
  const logger = makeLoggerSpy();
  const planner = makePlanner();

  await runDiscoverySeedPlan({
    config: {

      searchEngines: 'bing,brave,duckduckgo',
      discoveryEnabled: true,
      maxCandidateUrls: 0,
      fetchCandidateSources: false,
    },
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: { category: 'mouse', fieldOrder: [], fieldGroups: {} },
    job: { productId: 'mouse-test', brand: 'Test', model: 'Model' },
    runId: 'run-failure',
    logger,
    roundContext: {},
    requiredFields: [],
    llmContext: {},
    planner,
    normalizeFieldListFn: (list) => (Array.isArray(list) ? list : []),

    computeNeedSetFn: () => ({ fields: [], planner_seed: {} }),
    buildSearchPlanningContextFn: () => ({ focus_groups: [] }),
    buildSearchPlanFn: async () => { throw new Error('LLM unavailable'); },
    ...makeStageStubs(),
  });

  // No search_plan needset_computed because the LLM call failed.
  // The early needset_assessment may still fire before the failure.
  const searchPlanCalls = logger.calls.filter(
    (c) => c.level === 'info' && c.event === 'needset_computed' && c.payload?.scope === 'search_plan',
  );
  assert.equal(searchPlanCalls.length, 0, 'no search_plan needset_computed on failure');

  // But a warning was logged
  const warnCalls = logger.calls.filter(
    (c) => c.level === 'warn' && c.event === 'search_plan_failed',
  );
  assert.equal(warnCalls.length, 1, 'search_plan_failed warning logged');
  assert.equal(warnCalls[0].payload.error, 'LLM unavailable');
});

test('runDiscoverySeedPlan does NOT emit needset_computed when search plan has no panel', async () => {
  const logger = makeLoggerSpy();
  const planner = makePlanner();

  await runDiscoverySeedPlan({
    config: {

      searchEngines: 'bing,brave,duckduckgo',
      discoveryEnabled: true,
      maxCandidateUrls: 0,
      fetchCandidateSources: false,
    },
    storage: makeStorage(),
    category: 'mouse',
    categoryConfig: { category: 'mouse', fieldOrder: [], fieldGroups: {} },
    job: { productId: 'mouse-test', brand: 'Test', model: 'Model' },
    runId: 'run-no-panel',
    logger,
    roundContext: {},
    requiredFields: [],
    llmContext: {},
    planner,
    normalizeFieldListFn: (list) => (Array.isArray(list) ? list : []),

    computeNeedSetFn: () => makeNeedSetFixture(),
    buildSearchPlanningContextFn: () => ({}),
    // Search plan returns but with no panel
    buildSearchPlanFn: async () => ({
      schema_version: 'needset_planner_output.v2',
      search_plan_handoff: { queries: [], total: 0 },
      panel: null,
    }),
    ...makeStageStubs(),
  });

  // No search_plan needset_computed when panel is null.
  // The early needset_assessment may still fire.
  const searchPlanCalls = logger.calls.filter(
    (c) => c.level === 'info' && c.event === 'needset_computed' && c.payload?.scope === 'search_plan',
  );
  assert.equal(searchPlanCalls.length, 0, 'no search_plan needset_computed when panel is null');
});
