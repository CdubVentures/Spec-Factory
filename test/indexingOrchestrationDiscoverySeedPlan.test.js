import test from 'node:test';
import assert from 'node:assert/strict';
import { runDiscoverySeedPlan } from '../src/features/indexing/orchestration/index.js';

test('runDiscoverySeedPlan builds discovery hints, applies runtime search-disable override, and seeds planner queues', async () => {
  const normalizeCalls = [];
  const plannerApprovedDiscoveryCalls = [];
  const plannerCandidateSeedCalls = [];
  const loadSourceEntryCalls = [];
  const discoverCalls = [];
  const sourceEntries = [{
    sourceId: 'rtings_com',
    host: 'rtings.com',
    discovery: { method: 'search_first', enabled: true, priority: 90 },
  }];
  const discoveryResult = {
    enabled: true,
    approvedUrls: ['https://approved.example/spec'],
    candidateUrls: ['https://candidate.example/spec'],
  };

  const result = await runDiscoverySeedPlan({
    config: {
      searchProvider: 'serper',
      maxCandidateUrls: 10,
      fetchCandidateSources: true,
      marker: 'cfg',
    },
    runtimeOverrides: {
      disable_search: true,
    },
    storage: { marker: 'storage' },
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g', 'battery_life_hours'],
      schema: {
        critical_fields: ['battery_life_hours'],
      },
    },
    job: { productId: 'mouse-sample' },
    runId: 'run_12345678',
    logger: { marker: 'logger' },
    roundContext: {
      missing_required_fields: ['weight_g'],
      missing_critical_fields: ['battery_life_hours'],
      bundle_hints: [{ bundle_id: 'core_spec_sheet', fields: ['weight_g'] }],
    },
    requiredFields: ['weight_g'],
    llmContext: { marker: 'llm' },
    frontierDb: { marker: 'frontier' },
    traceWriter: { marker: 'trace' },
    learningStoreHints: { marker: 'learning' },
    planner: {
      enqueue(url, discoveredFrom, options) {
        plannerApprovedDiscoveryCalls.push({ url, discoveredFrom, options });
        return true;
      },
      seedCandidates(urls) {
        plannerCandidateSeedCalls.push({ urls });
      },
    },
    normalizeFieldListFn: (fields, options) => {
      normalizeCalls.push({ fields, options });
      return Array.from(fields || []).filter(Boolean);
    },
    loadEnabledSourceEntriesFn: async ({ config, category }) => {
      loadSourceEntryCalls.push({ config, category });
      return sourceEntries;
    },
    discoverCandidateSourcesFn: async (args) => {
      discoverCalls.push(args);
      return discoveryResult;
    },
  });

  assert.equal(result, discoveryResult);
  assert.equal(normalizeCalls.length, 2);
  assert.deepEqual(normalizeCalls[0].fields, ['weight_g']);
  assert.deepEqual(normalizeCalls[1].fields, ['battery_life_hours']);
  assert.equal(loadSourceEntryCalls.length, 1);
  assert.equal(loadSourceEntryCalls[0].category, 'mouse');
  assert.equal(loadSourceEntryCalls[0].config.marker, 'cfg');
  assert.equal(discoverCalls.length, 1);
  // WHY: discoveryEnabled is now a pipeline invariant — always forced true.
  // The disable_search runtime override is no longer honored.
  assert.equal(discoverCalls[0].config.discoveryEnabled, true);
  assert.equal(discoverCalls[0].config.searchProvider, 'serper');
  assert.equal(discoverCalls[0].sourceEntries, sourceEntries);
  assert.deepEqual(discoverCalls[0].planningHints, {
    missingRequiredFields: ['weight_g'],
    missingCriticalFields: ['battery_life_hours'],
    bundleHints: [{ bundle_id: 'core_spec_sheet', fields: ['weight_g'] }],
  });
  assert.deepEqual(plannerApprovedDiscoveryCalls, [
    {
      url: 'https://approved.example/spec',
      discoveredFrom: 'discovery_approved',
      options: { forceApproved: true, forceBrandBypass: false },
    },
  ]);
  assert.deepEqual(plannerCandidateSeedCalls, [
    {
      urls: ['https://candidate.example/spec'],
    },
  ]);
});

test('runDiscoverySeedPlan skips candidate seeding when fetchCandidateSources is disabled', async () => {
  let plannerCandidateSeeded = false;

  await runDiscoverySeedPlan({
    config: {
      searchProvider: 'serper',
      maxCandidateUrls: 10,
      fetchCandidateSources: false,
    },
    runtimeOverrides: {},
    storage: {},
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g'],
      schema: {
        critical_fields: ['battery_life_hours'],
      },
    },
    job: { productId: 'mouse-sample' },
    runId: 'run_87654321',
    logger: {},
    roundContext: {
      missing_required_fields: ['weight_g'],
      missing_critical_fields: ['battery_life_hours'],
      extra_queries: [],
    },
    requiredFields: ['weight_g'],
    llmContext: {},
    frontierDb: null,
    traceWriter: null,
    learningStoreHints: null,
    planner: {
      enqueue() {},
      seedCandidates() {
        plannerCandidateSeeded = true;
      },
    },
    normalizeFieldListFn: (fields) => Array.from(fields || []).filter(Boolean),
    loadEnabledSourceEntriesFn: async () => [],
    discoverCandidateSourcesFn: async () => ({
      enabled: true,
      approvedUrls: [],
      candidateUrls: ['https://candidate.example/spec'],
    }),
  });

  assert.equal(plannerCandidateSeeded, false);
});

test('runDiscoverySeedPlan recovers searchProvider when roundConfigBuilder sets it to none (round 0)', async () => {
  const discoverCalls = [];

  await runDiscoverySeedPlan({
    config: {
      searchProvider: 'none',
      discoveryEnabled: false,
      maxCandidateUrls: 10,
      fetchCandidateSources: true,
    },
    runtimeOverrides: {},
    storage: {},
    category: 'mouse',
    categoryConfig: {
      fieldOrder: ['weight_g'],
      schema: { critical_fields: [] },
    },
    job: { productId: 'mouse-round0' },
    runId: 'run_round0',
    logger: {},
    roundContext: {},
    requiredFields: [],
    llmContext: {},
    frontierDb: null,
    traceWriter: null,
    learningStoreHints: null,
    planner: { enqueue() {}, seedCandidates() {} },
    normalizeFieldListFn: (fields) => Array.from(fields || []).filter(Boolean),
    loadEnabledSourceEntriesFn: async () => [],
    discoverCandidateSourcesFn: async (args) => {
      discoverCalls.push(args);
      return { enabled: true, approvedUrls: [], candidateUrls: [] };
    },
  });

  assert.equal(discoverCalls.length, 1);
  // WHY: discoveryEnabled is a pipeline invariant — always forced true.
  assert.equal(discoverCalls[0].config.discoveryEnabled, true);
  // WHY: searchProvider 'none' from round 0 config must be recovered to 'dual'.
  assert.equal(discoverCalls[0].config.searchProvider, 'dual');
});
