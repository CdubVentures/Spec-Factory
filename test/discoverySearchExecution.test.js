/**
 * Unit tests for discoverySearchExecution.js
 *
 * Phase 4B: Tests for the search execution loop extracted from searchDiscovery.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSearchQueries } from '../src/features/indexing/discovery/discoverySearchExecution.js';

// ---------------------------------------------------------------------------
// Helpers: minimal mocks
// ---------------------------------------------------------------------------

function makeLogger() {
  const events = [];
  return {
    events,
    info: (name, data) => events.push({ event: name, data }),
    warn: (name, data) => events.push({ event: name, data }),
  };
}

function makeConfig(overrides = {}) {
  return {
    discoveryInternalFirst: false,
    discoveryInternalMinResults: 1,
    searchProvider: 'none',
    ...overrides,
  };
}

function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', role: 'manufacturer', tierName: 'manufacturer' },
      { host: 'rtings.com', role: 'lab', tierName: 'lab' },
    ],
    sourceHostMap: new Map([
      ['razer.com', { host: 'razer.com', tierName: 'manufacturer' }],
      ['rtings.com', { host: 'rtings.com', tierName: 'lab' }],
    ]),
    fieldOrder: [],
    ...overrides,
  };
}

function makeProviderState(overrides = {}) {
  return {
    provider: 'none',
    internet_ready: false,
    active_providers: [],
    fallback_reason: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Returns correct structure with all required fields
// ---------------------------------------------------------------------------

test('executeSearchQueries: returns correct result shape', async () => {
  const result = await executeSearchQueries({
    config: makeConfig(),
    storage: null,
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: [],
    executionQueryLimit: 0,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState(),
    requiredOnlySearch: false,
    missingRequiredFields: [],
  });

  assert.ok(Array.isArray(result.rawResults));
  assert.ok(Array.isArray(result.searchAttempts));
  assert.ok(Array.isArray(result.searchJournal));
  assert.equal(typeof result.internalSatisfied, 'boolean');
  assert.equal(result.internalSatisfied, false);
  assert.equal(result.externalSearchReason, null);
});

// ---------------------------------------------------------------------------
// 2. Plan-only mode: no provider, generates planned URLs
// ---------------------------------------------------------------------------

test('executeSearchQueries: plan-only produces planned URLs from source hosts', async () => {
  const logger = makeLogger();
  const result = await executeSearchQueries({
    config: makeConfig({ searchProvider: 'none' }),
    storage: null,
    logger,
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-razer-viper-v3-pro', category: 'mouse' },
    runId: 'run-001',
    queries: ['razer viper v3 pro spec'],
    executionQueryLimit: 4,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: ['sensor', 'weight'],
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'none', internet_ready: false }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
  });

  assert.ok(result.rawResults.length > 0, 'should produce plan-only results');
  assert.equal(result.searchAttempts.length, 1);
  assert.equal(result.searchAttempts[0].provider, 'plan');
  assert.equal(result.searchAttempts[0].reason_code, 'plan_only_no_provider');
});

// ---------------------------------------------------------------------------
// 3. Plan-only mode: logs query lifecycle events
// ---------------------------------------------------------------------------

test('executeSearchQueries: plan-only emits discovery_query lifecycle events', async () => {
  const logger = makeLogger();
  await executeSearchQueries({
    config: makeConfig({ searchProvider: 'none' }),
    storage: null,
    logger,
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-razer-viper-v3-pro', category: 'mouse' },
    runId: 'run-001',
    queries: ['razer viper v3 pro spec'],
    executionQueryLimit: 4,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'none', internet_ready: false }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
  });

  const started = logger.events.filter((e) => e.event === 'discovery_query_started');
  const completed = logger.events.filter((e) => e.event === 'discovery_query_completed');
  assert.ok(started.length > 0, 'should emit discovery_query_started');
  assert.ok(completed.length > 0, 'should emit discovery_query_completed');
});

// ---------------------------------------------------------------------------
// 4. Internal-first: searches corpus and accumulates results
// ---------------------------------------------------------------------------

test('executeSearchQueries: internal-first accumulates corpus results', async () => {
  const mockCorpusResults = [
    { url: 'https://rtings.com/mice/razer-viper', title: 'RTINGS Viper', provider: 'internal' },
  ];
  const result = await executeSearchQueries({
    config: makeConfig({ discoveryInternalFirst: true, searchProvider: 'none' }),
    storage: { readJsonOrNull: async () => null },
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-razer-viper', category: 'mouse' },
    runId: 'run-001',
    queries: ['razer viper spec'],
    executionQueryLimit: 4,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: ['sensor'],
    variables: { brand: 'Razer', model: 'Viper', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'none', internet_ready: false }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
    // override corpus search via dependency injection
    _searchSourceCorpusFn: async () => mockCorpusResults,
  });

  assert.equal(result.rawResults.length, 1);
  assert.equal(result.rawResults[0].url, 'https://rtings.com/mice/razer-viper');
  assert.equal(result.searchAttempts[0].provider, 'internal');
});

// ---------------------------------------------------------------------------
// 5. Internal-first: sets internalSatisfied when enough results
// ---------------------------------------------------------------------------

test('executeSearchQueries: internalSatisfied when corpus exceeds threshold', async () => {
  const result = await executeSearchQueries({
    config: makeConfig({ discoveryInternalFirst: true, discoveryInternalMinResults: 1, searchProvider: 'none' }),
    storage: { readJsonOrNull: async () => null },
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-razer-viper', category: 'mouse' },
    runId: 'run-001',
    queries: ['razer viper spec'],
    executionQueryLimit: 4,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: ['sensor'],
    variables: { brand: 'Razer', model: 'Viper', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'none', internet_ready: false }),
    requiredOnlySearch: true,
    missingRequiredFields: ['sensor'],
    _searchSourceCorpusFn: async () => [
      { url: 'https://rtings.com/mice/razer-viper', title: 'RTINGS', provider: 'internal' },
    ],
  });

  assert.equal(result.internalSatisfied, true);
  assert.equal(result.externalSearchReason, 'internal_satisfied_skip_external');
});

// ---------------------------------------------------------------------------
// 6. Internet search: runs queries with mock provider
// ---------------------------------------------------------------------------

test('executeSearchQueries: internet search runs provider and accumulates results', async () => {
  const result = await executeSearchQueries({
    config: makeConfig({ searchProvider: 'google' }),
    storage: null,
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-razer-viper', category: 'mouse' },
    runId: 'run-001',
    queries: ['razer viper spec'],
    executionQueryLimit: 1,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: ['sensor'],
    variables: { brand: 'Razer', model: 'Viper', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
    _runSearchProvidersFn: async ({ query }) => [
      { url: 'https://rtings.com/viper', title: 'RTINGS review', snippet: 'Razer Viper', provider: 'google' },
    ],
  });

  assert.equal(result.rawResults.length, 1);
  assert.equal(result.rawResults[0].url, 'https://rtings.com/viper');
  assert.equal(result.searchAttempts.length, 1);
  assert.equal(result.searchAttempts[0].provider, 'google');
  assert.equal(result.searchAttempts[0].reason_code, 'internet_search');
});

// ---------------------------------------------------------------------------
// 7. Internet search: zero-result fallback
// ---------------------------------------------------------------------------

test('executeSearchQueries: internet search applies zero-result fallback', async () => {
  const result = await executeSearchQueries({
    config: makeConfig({ searchProvider: 'google' }),
    storage: null,
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-razer-viper', category: 'mouse' },
    runId: 'run-001',
    queries: ['razer viper spec'],
    executionQueryLimit: 1,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: ['sensor'],
    variables: { brand: 'Razer', model: 'Viper', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
    // Provider returns zero results — fallback should generate planned URLs
    _runSearchProvidersFn: async () => [],
  });

  // Fallback may or may not produce results depending on source hosts and query
  // but the attempt should be recorded
  assert.equal(result.searchAttempts.length, 1);
  const reasonCode = result.searchAttempts[0].reason_code;
  assert.ok(
    reasonCode === 'internet_search' || reasonCode === 'internet_search_zero_plan_fallback',
    `expected internet_search or fallback, got ${reasonCode}`
  );
});

// ---------------------------------------------------------------------------
// 8. Internet search: frontier cache during internet mode
// ---------------------------------------------------------------------------

test('executeSearchQueries: uses frontier cache during internet search', async () => {
  const logger = makeLogger();
  const cachedResults = [
    { url: 'https://example.com/cached', title: 'Cached', provider: 'google' },
  ];
  const frontierDb = {
    shouldSkipQuery: ({ query }) => query === 'cached query',
    getQueryRecord: () => ({ provider: 'google', results: cachedResults }),
    recordQuery: () => null,
  };

  const result = await executeSearchQueries({
    config: makeConfig({ searchProvider: 'google' }),
    storage: null,
    logger,
    runtimeTraceWriter: null,
    frontierDb,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: ['cached query'],
    executionQueryLimit: 1,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
    _runSearchProvidersFn: async () => { throw new Error('should not call provider'); },
  });

  assert.equal(result.rawResults.length, 1);
  assert.equal(result.searchAttempts[0].reason_code, 'frontier_query_cache');
  const cacheEvents = logger.events.filter((e) => e.event === 'discovery_query_started' && e.data?.cache_hit);
  assert.ok(cacheEvents.length > 0, 'should emit cache hit lifecycle events');
});

// ---------------------------------------------------------------------------
// 9. Skips internet when internalSatisfied and internalFirst
// ---------------------------------------------------------------------------

test('executeSearchQueries: skips internet search when internal satisfied', async () => {
  let providerCalled = false;
  const result = await executeSearchQueries({
    config: makeConfig({ discoveryInternalFirst: true, discoveryInternalMinResults: 1, searchProvider: 'google' }),
    storage: { readJsonOrNull: async () => null },
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: ['test query'],
    executionQueryLimit: 1,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: ['sensor'],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    requiredOnlySearch: true,
    missingRequiredFields: ['sensor'],
    _searchSourceCorpusFn: async () => [
      { url: 'https://rtings.com/test', title: 'Test', provider: 'internal' },
    ],
    _runSearchProvidersFn: async () => { providerCalled = true; return []; },
  });

  assert.equal(result.internalSatisfied, true);
  assert.equal(providerCalled, false, 'should not call internet provider when internal satisfied');
});

// ---------------------------------------------------------------------------
// 10. Provider diagnostics logged
// ---------------------------------------------------------------------------

test('executeSearchQueries: logs search_provider_diagnostics', async () => {
  const logger = makeLogger();
  await executeSearchQueries({
    config: makeConfig(),
    storage: null,
    logger,
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: [],
    executionQueryLimit: 0,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
  });

  const diag = logger.events.find((e) => e.event === 'search_provider_diagnostics');
  assert.ok(diag, 'should log provider diagnostics');
  assert.equal(diag.data.provider, 'google');
});

// ---------------------------------------------------------------------------
// 11. Internet search: records journal entries
// ---------------------------------------------------------------------------

test('executeSearchQueries: internet search populates searchJournal', async () => {
  const result = await executeSearchQueries({
    config: makeConfig({ searchProvider: 'google' }),
    storage: null,
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: ['q1', 'q2'],
    executionQueryLimit: 2,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
    _runSearchProvidersFn: async ({ query }) => [
      { url: `https://example.com/${query}`, title: query, provider: 'google' },
    ],
  });

  assert.equal(result.searchJournal.length, 2);
  assert.ok(result.searchJournal[0].ts, 'journal entries should have timestamps');
  assert.equal(result.searchJournal[0].provider, 'google');
});

// ---------------------------------------------------------------------------
// 12. Internal-first: frontier cache during internal mode
// ---------------------------------------------------------------------------

test('executeSearchQueries: internal-first uses frontier cache', async () => {
  const cachedResults = [
    { url: 'https://example.com/cached', title: 'Cached Internal', provider: 'frontier_cache' },
  ];
  const frontierDb = {
    shouldSkipQuery: () => true,
    getQueryRecord: () => ({ provider: 'frontier_cache', results: cachedResults }),
    recordQuery: () => null,
  };

  const result = await executeSearchQueries({
    config: makeConfig({ discoveryInternalFirst: true, searchProvider: 'none' }),
    storage: { readJsonOrNull: async () => null },
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: ['test query'],
    executionQueryLimit: 1,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'none', internet_ready: false }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
  });

  assert.equal(result.rawResults.length, 1);
  assert.equal(result.searchAttempts[0].reason_code, 'frontier_query_cache');
});

// ---------------------------------------------------------------------------
// 13. Empty queries returns empty results
// ---------------------------------------------------------------------------

test('executeSearchQueries: empty queries with available provider produces empty results', async () => {
  const result = await executeSearchQueries({
    config: makeConfig({ searchProvider: 'google' }),
    storage: null,
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: [],
    executionQueryLimit: 0,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
    _runSearchProvidersFn: async () => [],
  });

  assert.deepStrictEqual(result.rawResults, []);
  assert.deepStrictEqual(result.searchAttempts, []);
  assert.deepStrictEqual(result.searchJournal, []);
});

// ---------------------------------------------------------------------------
// 14. Internet search: writes runtime traces
// ---------------------------------------------------------------------------

test('executeSearchQueries: writes runtime traces when writer provided', async () => {
  const traces = [];
  const runtimeTraceWriter = {
    writeJson: async ({ section, prefix, payload }) => {
      traces.push({ section, prefix, payload });
      return { trace_path: '/tmp/trace.json' };
    },
  };

  await executeSearchQueries({
    config: makeConfig({ searchProvider: 'google' }),
    storage: null,
    logger: makeLogger(),
    runtimeTraceWriter,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: ['test query'],
    executionQueryLimit: 1,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    requiredOnlySearch: false,
    missingRequiredFields: [],
    _runSearchProvidersFn: async () => [
      { url: 'https://example.com/r', title: 'Result', provider: 'google' },
    ],
  });

  assert.ok(traces.length > 0, 'should write at least one trace');
  assert.equal(traces[0].section, 'search');
});

// ---------------------------------------------------------------------------
// 15. Internal-first: externalSearchReason set when not satisfied
// ---------------------------------------------------------------------------

test('executeSearchQueries: externalSearchReason when internal under target', async () => {
  const result = await executeSearchQueries({
    config: makeConfig({ discoveryInternalFirst: true, discoveryInternalMinResults: 5, searchProvider: 'none' }),
    storage: { readJsonOrNull: async () => null },
    logger: makeLogger(),
    runtimeTraceWriter: null,
    frontierDb: null,
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'run-001',
    queries: ['test'],
    executionQueryLimit: 1,
    queryConcurrency: 1,
    resultsPerQuery: 10,
    queryLimit: 4,
    searchProfileCaps: { deterministicAliasCap: 6 },
    missingFields: [],
    variables: { brand: 'Test', model: 'Mouse', variant: '', category: 'mouse' },
    selectedQueryRowMap: new Map(),
    profileQueryRowMap: new Map(),
    providerState: makeProviderState({ provider: 'none', internet_ready: false }),
    requiredOnlySearch: false,
    missingRequiredFields: ['sensor'],
    _searchSourceCorpusFn: async () => [
      { url: 'https://example.com/one', title: 'One', provider: 'internal' },
    ],
  });

  assert.equal(result.internalSatisfied, false);
  assert.equal(result.externalSearchReason, 'required_fields_missing_internal_under_target');
});
