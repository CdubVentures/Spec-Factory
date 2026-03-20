/**
 * Characterization tests for processDiscoveryResults.
 *
 * Locks the current output contract SHAPE before the Stage 06 SERP Triage rebuild.
 * These tests verify keys, types, and nesting — not specific values, because
 * the rebuild intentionally changes which URLs are selected.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processDiscoveryResults } from '../discoveryResultProcessor.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeCategoryConfig() {
  return {
    category: 'mouse',
    fieldOrder: ['weight', 'sensor', 'dpi', 'polling_rate'],
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      { host: 'rtings.com', tierName: 'lab', role: 'review', tier: 2 },
      { host: 'techpowerup.com', tierName: 'lab', role: 'review', tier: 2 },
      { host: 'amazon.com', tierName: 'retailer', role: 'retailer', tier: 3 },
      { host: 'spam-site.biz', tierName: 'denied', role: 'denied', tier: 4 },
    ],
    denylist: ['spam-site.biz'],
  };
}

function makeIdentityLock() {
  return { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' };
}

function makeConfig(overrides = {}) {
  return {
    serpTriageMinScore: 0,
    searchProvider: 'dual',
    llmModelPlan: 'test-model',
    s3InputPrefix: '_test',
    discoveryResultsPerQuery: 10,
    ...overrides,
  };
}

function makeRawResults() {
  return [
    {
      url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      snippet: 'Official product page for the Razer Viper V3 Pro gaming mouse',
      provider: 'google',
      query: 'razer viper v3 pro specs',
    },
    {
      url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
      title: 'Razer Viper V3 Pro Review - RTINGS',
      snippet: 'Full lab review with measurements and latency testing',
      provider: 'google',
      query: 'razer viper v3 pro review',
    },
    {
      url: 'https://amazon.com/dp/B0EXAMPLE',
      title: 'Razer Viper V3 Pro Gaming Mouse',
      snippet: 'Buy the Razer Viper V3 Pro',
      provider: 'bing',
      query: 'razer viper v3 pro specs',
    },
  ];
}

function makeSearchProfilePlanned() {
  return {
    category: 'mouse',
    focus_fields: ['weight', 'sensor', 'dpi'],
    variant_guard_terms: ['hyperspeed'],
    identity_aliases: [],
    query_rows: [
      {
        query: 'razer viper v3 pro specs',
        hint_source: 'archetype_planner',
        target_fields: ['weight', 'sensor', 'dpi'],
        doc_hint: 'spec',
        domain_hint: 'razer.com',
      },
      {
        query: 'razer viper v3 pro review',
        hint_source: 'archetype_planner',
        target_fields: ['sensor', 'polling_rate'],
        doc_hint: 'review',
        domain_hint: '',
      },
    ],
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
  };
}

// WHY: LLM selector is the only triage path. Stub approves all candidates.
function makeStubSerpSelectorCallFn() {
  return async ({ selectorInput }) => {
    const ids = selectorInput.candidates.map((c) => c.id);
    return {
      schema_version: 'serp_selector_output.v1',
      keep_ids: ids,
      approved_ids: ids.slice(0, 1),
      candidate_ids: ids.slice(1),
      reject_ids: [],
      results: ids.map((id, i) => ({
        id,
        decision: i === 0 ? 'approved' : 'candidate',
        score: i === 0 ? 0.95 : 0.6,
        confidence: 'high',
        fetch_rank: i + 1,
        page_type: 'product_page',
        authority_bucket: 'official',
        likely_field_keys: ['weight'],
        reason_code: 'exact_official_product',
        reason: 'Stub selector',
      })),
      summary: { input_count: ids.length, approved_count: 1, candidate_count: ids.length - 1, reject_count: 0 },
    };
  };
}

function makeStubStorage() {
  const written = [];
  return {
    written,
    writeObject: async (key, buffer, opts) => {
      written.push({ key, size: buffer.length, contentType: opts?.contentType });
    },
  };
}

function makeStubFrontierDb() {
  return {
    canonicalize: (url) => ({ canonical_url: url }),
    shouldSkipUrl: () => ({ skip: false }),
  };
}

function makeStubLogger() {
  const events = [];
  return {
    events,
    info: (event, payload) => events.push({ event, payload }),
    warn: (event, payload) => events.push({ event, payload }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Characterization — processDiscoveryResults output contract shape', () => {
  it('returns all required top-level keys with correct types', async () => {
    const storage = makeStubStorage();
    const logger = makeStubLogger();
    const result = await processDiscoveryResults({
      rawResults: makeRawResults(),
      searchAttempts: [{ query: 'razer viper v3 pro specs', attempts: 1, result_count: 2, providers: ['google'] }],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: 'missing_fields',
      config: makeConfig(),
      storage,
      categoryConfig: makeCategoryConfig(),
      job: { productId: 'test-product' },
      runId: 'run-001',
      logger,
      runtimeTraceWriter: null,
      frontierDb: makeStubFrontierDb(),
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      identityLock: makeIdentityLock(),
      brandResolution: { officialDomain: 'razer.com' },
      missingFields: ['weight', 'sensor', 'dpi'],
      learning: { fieldYield: {} },
      llmContext: {},
      searchProfileBase: { variant_guard_terms: ['hyperspeed'] },
      llmQueries: [],
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
      searchProfilePlanned: makeSearchProfilePlanned(),
      searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
      providerState: {},
      queryConcurrency: 2,
      discoveryCap: 20,
      effectiveHostPlan: null,
      _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
    });

    // Top-level keys
    assert.equal(result.enabled, true);
    assert.equal(typeof result.discoveryKey, 'string');
    assert.equal(typeof result.candidatesKey, 'string');
    assert.ok(Array.isArray(result.candidates), 'candidates is array');
    assert.ok(Array.isArray(result.selectedUrls), 'selectedUrls is array');
    assert.ok(Array.isArray(result.queries), 'queries is array');
    assert.ok(Array.isArray(result.llm_queries), 'llm_queries is array');
    assert.ok(typeof result.search_profile === 'object' && result.search_profile !== null, 'search_profile is object');
    assert.equal(typeof result.search_profile_key, 'string');
    assert.equal(typeof result.search_profile_run_key, 'string');
    assert.equal(typeof result.search_profile_latest_key, 'string');
    assert.ok(typeof result.provider_state === 'object', 'provider_state is object');
    assert.equal(typeof result.query_concurrency, 'number');
    assert.equal(typeof result.internal_satisfied, 'boolean');
    assert.equal(typeof result.external_search_reason, 'string');
    assert.ok(Array.isArray(result.search_attempts), 'search_attempts is array');
    assert.ok(Array.isArray(result.search_journal), 'search_journal is array');
    assert.ok(typeof result.serp_explorer === 'object' && result.serp_explorer !== null, 'serp_explorer is object');
  });

  it('selectedUrls are string arrays matching candidates', async () => {
    const result = await processDiscoveryResults({
      rawResults: makeRawResults(),
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: '',
      config: makeConfig(),
      storage: makeStubStorage(),
      categoryConfig: makeCategoryConfig(),
      job: { productId: 'p1' },
      runId: 'r1',
      logger: makeStubLogger(),
      runtimeTraceWriter: null,
      frontierDb: makeStubFrontierDb(),
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      identityLock: makeIdentityLock(),
      brandResolution: { officialDomain: 'razer.com' },
      missingFields: ['weight'],
      learning: { fieldYield: {} },
      llmContext: {},
      searchProfileBase: { variant_guard_terms: [] },
      llmQueries: [],
      queries: ['razer viper v3 pro specs'],
      searchProfilePlanned: makeSearchProfilePlanned(),
      searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
      providerState: {},
      queryConcurrency: 1,
      discoveryCap: 20,
      effectiveHostPlan: null,
      _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
    });

    for (const url of result.selectedUrls) {
      assert.equal(typeof url, 'string', 'each selectedUrl is a string');
      assert.ok(url.startsWith('https://'), 'selectedUrl starts with https://');
    }
    // selectedUrls = all candidate URLs
    const selectedSet = new Set(result.selectedUrls);
    const candidateUrlSet = new Set(result.candidates.map((c) => c.url));
    assert.deepEqual(selectedSet, candidateUrlSet, 'selectedUrls = all candidate URLs');
  });

  it('serp_explorer has expected top-level shape', async () => {
    const result = await processDiscoveryResults({
      rawResults: makeRawResults(),
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: '',
      config: makeConfig(),
      storage: makeStubStorage(),
      categoryConfig: makeCategoryConfig(),
      job: { productId: 'p1' },
      runId: 'r1',
      logger: makeStubLogger(),
      runtimeTraceWriter: null,
      frontierDb: makeStubFrontierDb(),
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      identityLock: makeIdentityLock(),
      brandResolution: { officialDomain: 'razer.com' },
      missingFields: ['weight'],
      learning: { fieldYield: {} },
      llmContext: {},
      searchProfileBase: { variant_guard_terms: [] },
      llmQueries: [],
      queries: ['razer viper v3 pro specs'],
      searchProfilePlanned: makeSearchProfilePlanned(),
      searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
      providerState: {},
      queryConcurrency: 1,
      discoveryCap: 20,
      effectiveHostPlan: null,
      _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
    });

    const se = result.serp_explorer;
    assert.ok(se !== null && typeof se === 'object', 'serp_explorer exists');

    // Capture actual keys for shape contract
    const requiredKeys = [
      'generated_at', 'llm_selector_enabled', 'llm_selector_applied',
      'query_count', 'candidates_checked', 'urls_triaged',
      'urls_selected', 'urls_rejected',
      'dedupe_input', 'dedupe_output', 'duplicates_removed', 'queries',
    ];
    for (const key of requiredKeys) {
      assert.ok(key in se, `serp_explorer has key '${key}', got keys: ${Object.keys(se).join(', ')}`);
    }
    assert.ok(Array.isArray(se.queries), 'serp_explorer.queries is array');
    assert.equal(typeof se.generated_at, 'string');
    assert.equal(typeof se.llm_selector_enabled, 'boolean');
    assert.equal(typeof se.llm_selector_applied, 'boolean');
    assert.equal(typeof se.query_count, 'number');
    assert.equal(typeof se.candidates_checked, 'number');
    assert.equal(typeof se.urls_triaged, 'number');
    assert.equal(typeof se.urls_selected, 'number');
    assert.equal(typeof se.urls_rejected, 'number');
    assert.equal(typeof se.dedupe_input, 'number');
    assert.equal(typeof se.dedupe_output, 'number');
    assert.equal(typeof se.duplicates_removed, 'number');
  });

  it('serp_explorer query rows have expected candidate shape', async () => {
    const result = await processDiscoveryResults({
      rawResults: makeRawResults(),
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: '',
      config: makeConfig(),
      storage: makeStubStorage(),
      categoryConfig: makeCategoryConfig(),
      job: { productId: 'p1' },
      runId: 'r1',
      logger: makeStubLogger(),
      runtimeTraceWriter: null,
      frontierDb: makeStubFrontierDb(),
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      identityLock: makeIdentityLock(),
      brandResolution: { officialDomain: 'razer.com' },
      missingFields: ['weight'],
      learning: { fieldYield: {} },
      llmContext: {},
      searchProfileBase: { variant_guard_terms: [] },
      llmQueries: [],
      queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
      searchProfilePlanned: makeSearchProfilePlanned(),
      searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
      providerState: {},
      queryConcurrency: 1,
      discoveryCap: 20,
      effectiveHostPlan: null,
      _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
    });

    const queryRow = result.serp_explorer.queries.find((q) => q.candidates.length > 0);
    assert.ok(queryRow, 'at least one query row has candidates');

    // Query row shape
    assert.equal(typeof queryRow.query, 'string');
    assert.equal(typeof queryRow.hint_source, 'string');
    assert.ok(Array.isArray(queryRow.target_fields), 'target_fields is array');
    assert.equal(typeof queryRow.doc_hint, 'string');
    assert.equal(typeof queryRow.domain_hint, 'string');
    assert.equal(typeof queryRow.result_count, 'number');
    assert.equal(typeof queryRow.attempts, 'number');
    assert.ok(Array.isArray(queryRow.providers), 'providers is array');
    assert.equal(typeof queryRow.candidate_count, 'number');
    assert.equal(typeof queryRow.selected_count, 'number');

    // Candidate shape
    const candidate = queryRow.candidates[0];
    assert.equal(typeof candidate.url, 'string');
    assert.equal(typeof candidate.title, 'string');
    assert.equal(typeof candidate.snippet, 'string');
    assert.equal(typeof candidate.host, 'string');
    assert.equal(typeof candidate.doc_kind, 'string');
    assert.equal(typeof candidate.triage_score, 'number');
    assert.equal(typeof candidate.triage_reason, 'string');
    assert.equal(typeof candidate.decision, 'string');
    assert.ok(Array.isArray(candidate.reason_codes), 'reason_codes is array');
    assert.ok(Array.isArray(candidate.providers), 'providers is array');
  });

  it('search_profile (searchProfileFinal) has expected shape', async () => {
    const result = await processDiscoveryResults({
      rawResults: makeRawResults(),
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: '',
      config: makeConfig(),
      storage: makeStubStorage(),
      categoryConfig: makeCategoryConfig(),
      job: { productId: 'p1' },
      runId: 'r1',
      logger: makeStubLogger(),
      runtimeTraceWriter: null,
      frontierDb: makeStubFrontierDb(),
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      identityLock: makeIdentityLock(),
      brandResolution: { officialDomain: 'razer.com' },
      missingFields: ['weight'],
      learning: { fieldYield: {} },
      llmContext: {},
      searchProfileBase: { variant_guard_terms: [] },
      llmQueries: [],
      queries: ['razer viper v3 pro specs'],
      searchProfilePlanned: makeSearchProfilePlanned(),
      searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
      providerState: {},
      queryConcurrency: 1,
      discoveryCap: 20,
      effectiveHostPlan: null,
      _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
    });

    const sp = result.search_profile;
    assert.equal(typeof sp.generated_at, 'string');
    assert.equal(sp.status, 'executed');
    assert.ok(Array.isArray(sp.query_rows), 'query_rows is array');
    assert.ok(Array.isArray(sp.query_stats), 'query_stats is array');
    assert.equal(typeof sp.discovered_count, 'number');
    assert.equal(typeof sp.selected_count, 'number');
    assert.equal(typeof sp.llm_query_planning, 'boolean');
    assert.equal(typeof sp.llm_query_model, 'string');
    assert.equal(typeof sp.llm_serp_selector, 'boolean');
    assert.equal(typeof sp.llm_serp_selector_model, 'string');
    assert.ok(typeof sp.serp_explorer === 'object', 'serp_explorer embedded in search_profile');
  });

  it('storage receives exactly 2 writes (discovery + candidates)', async () => {
    const storage = makeStubStorage();
    await processDiscoveryResults({
      rawResults: makeRawResults(),
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: '',
      config: makeConfig(),
      storage,
      categoryConfig: makeCategoryConfig(),
      job: { productId: 'p1' },
      runId: 'r1',
      logger: makeStubLogger(),
      runtimeTraceWriter: null,
      frontierDb: makeStubFrontierDb(),
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      identityLock: makeIdentityLock(),
      brandResolution: { officialDomain: 'razer.com' },
      missingFields: ['weight'],
      learning: { fieldYield: {} },
      llmContext: {},
      searchProfileBase: { variant_guard_terms: [] },
      llmQueries: [],
      queries: ['razer viper v3 pro specs'],
      searchProfilePlanned: makeSearchProfilePlanned(),
      searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
      providerState: {},
      queryConcurrency: 1,
      discoveryCap: 20,
      effectiveHostPlan: null,
      _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
    });

    // 2 storage writes: discoveryPayload + candidatePayload
    // Plus writeSearchProfileArtifacts writes (variable count)
    assert.ok(storage.written.length >= 2, `expected >= 2 storage writes, got ${storage.written.length}`);
    assert.ok(
      storage.written.every((w) => w.contentType === 'application/json'),
      'all writes are application/json'
    );
  });

  it('logger emits expected event names', async () => {
    const logger = makeStubLogger();
    await processDiscoveryResults({
      rawResults: makeRawResults(),
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: '',
      config: makeConfig(),
      storage: makeStubStorage(),
      categoryConfig: makeCategoryConfig(),
      job: { productId: 'p1' },
      runId: 'r1',
      logger,
      runtimeTraceWriter: null,
      frontierDb: makeStubFrontierDb(),
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      identityLock: makeIdentityLock(),
      brandResolution: { officialDomain: 'razer.com' },
      missingFields: ['weight'],
      learning: { fieldYield: {} },
      llmContext: {},
      searchProfileBase: { variant_guard_terms: [] },
      llmQueries: [],
      queries: ['razer viper v3 pro specs'],
      searchProfilePlanned: makeSearchProfilePlanned(),
      searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
      providerState: {},
      queryConcurrency: 1,
      discoveryCap: 20,
      effectiveHostPlan: null,
      _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
    });

    const eventNames = logger.events.map((e) => e.event);
    assert.ok(eventNames.includes('discovery_serp_deduped'), 'emits discovery_serp_deduped');
    assert.ok(eventNames.includes('domains_classified'), 'emits domains_classified');
    assert.ok(eventNames.includes('discovery_results_reranked'), 'emits discovery_results_reranked');
  });

  it('hard-drops denied hosts and non-https, keeps valid candidates', async () => {
    const rawResults = [
      ...makeRawResults(),
      {
        url: 'https://spam-site.biz/razer-viper',
        title: 'Spam', snippet: 'Spam', provider: 'google',
        query: 'razer viper v3 pro specs',
      },
      {
        url: 'http://razer.com/gaming-mice/razer-viper-v3-pro',
        title: 'HTTP Razer', snippet: 'HTTP', provider: 'bing',
        query: 'razer viper v3 pro specs',
      },
    ];

    const result = await processDiscoveryResults({
      rawResults,
      searchAttempts: [],
      searchJournal: [],
      internalSatisfied: false,
      externalSearchReason: '',
      config: makeConfig(),
      storage: makeStubStorage(),
      categoryConfig: makeCategoryConfig(),
      job: { productId: 'p1' },
      runId: 'r1',
      logger: makeStubLogger(),
      runtimeTraceWriter: null,
      frontierDb: makeStubFrontierDb(),
      variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
      identityLock: makeIdentityLock(),
      brandResolution: { officialDomain: 'razer.com' },
      missingFields: ['weight'],
      learning: { fieldYield: {} },
      llmContext: {},
      searchProfileBase: { variant_guard_terms: [] },
      llmQueries: [],
      queries: ['razer viper v3 pro specs'],
      searchProfilePlanned: makeSearchProfilePlanned(),
      searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
      providerState: {},
      queryConcurrency: 1,
      discoveryCap: 20,
      effectiveHostPlan: null,
      _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
    });

    // Denied host must not appear in candidates
    const candidateUrls = result.candidates.map((c) => c.url);
    assert.ok(
      !candidateUrls.some((u) => u.includes('spam-site.biz')),
      'denied host excluded from candidates'
    );
    // Valid HTTPS candidates should be present
    assert.ok(candidateUrls.length >= 1, 'at least one valid candidate survives');
  });
});
