/**
 * Integration tests for LLM SERP Selector in processDiscoveryResults.
 * The selector is the only triage path — no deterministic fallback.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processDiscoveryResults } from '../src/features/indexing/discovery/discoveryResultProcessor.js';

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
      { host: 'amazon.com', tierName: 'retailer', role: 'retailer', tier: 3 },
    ],
    denylist: ['spam-site.biz'],
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
    variant_guard_terms: [],
    identity_aliases: [],
    query_rows: [
      { query: 'razer viper v3 pro specs', hint_source: 'deterministic', target_fields: ['weight'], doc_hint: 'spec', domain_hint: 'razer.com' },
      { query: 'razer viper v3 pro review', hint_source: 'archetype_planner', target_fields: ['sensor'], doc_hint: 'review', domain_hint: '' },
    ],
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
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
    isDomainDead: () => false,
    isRepeatLoser: () => false,
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

function makeBaseArgs(overrides = {}) {
  return {
    rawResults: makeRawResults(),
    searchAttempts: [{ query: 'razer viper v3 pro specs', attempts: 1, result_count: 2, providers: ['google'] }],
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: 'missing_fields',
    config: {
      llmModelPlan: 'test-model',
      s3InputPrefix: '_test',
      ...overrides.config,
    },
    storage: makeStubStorage(),
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'mouse-razer-viper-v3-pro' },
    runId: 'run-001',
    logger: makeStubLogger(),
    runtimeTraceWriter: null,
    frontierDb: makeStubFrontierDb(),
    variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro', brand_tokens: ['razer'], model_tokens: ['viper', 'v3', 'pro'] },
    brandResolution: { officialDomain: 'razer.com', supportDomain: '', aliases: [] },
    missingFields: ['weight', 'sensor', 'dpi'],
    learning: { fieldYield: {} },
    llmContext: {},
    searchProfileBase: { variant_guard_terms: [] },
    llmQueries: [],
    uberSearchPlan: null,
    uberMode: false,
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    providerState: {},
    queryConcurrency: 1,
    discoveryCap: 20,
    effectiveHostPlan: null,
    ...overrides,
  };
}

function makeSelectorOutput(candidateIds) {
  return { keep_ids: [...candidateIds] };
}

function makeAllRejectOutput() {
  return { keep_ids: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SERP Selector integration in processDiscoveryResults', () => {
  it('calls LLM selector and produces candidates', async () => {
    let selectorInput = null;
    const args = makeBaseArgs({
      _serpSelectorCallFn: async ({ selectorInput: input }) => {
        selectorInput = input;
        const ids = input.candidates.map((c) => c.id);
        return makeSelectorOutput(ids);
      },
    });
    const result = await processDiscoveryResults(args);
    assert.ok(selectorInput, 'selector was called');
    assert.ok(selectorInput.product, 'input has product');
    assert.ok(selectorInput.candidates, 'input has candidates');
    assert.equal(result.enabled, true);
    assert.ok(result.candidates.length >= 1);
  });

  it('uses generated candidate IDs (c_N format)', async () => {
    let receivedIds = null;
    const args = makeBaseArgs({
      _serpSelectorCallFn: async ({ selectorInput }) => {
        receivedIds = selectorInput.candidates.map((c) => c.id);
        return makeSelectorOutput(receivedIds);
      },
    });
    await processDiscoveryResults(args);
    assert.ok(receivedIds);
    for (const id of receivedIds) {
      assert.ok(id.startsWith('c_'), `expected generated id format, got: ${id}`);
    }
  });

  it('valid all-reject produces zero candidates', async () => {
    const logger = makeStubLogger();
    const args = makeBaseArgs({
      logger,
      _serpSelectorCallFn: async ({ selectorInput }) => {
        const ids = selectorInput.candidates.map((c) => c.id);
        return makeAllRejectOutput();
      },
    });
    const result = await processDiscoveryResults(args);
    assert.equal(result.enabled, true);
    assert.equal(result.candidates.length, 0, 'all-reject means zero candidates');
  });

  it('LLM call failure produces zero candidates (no fallback)', async () => {
    const logger = makeStubLogger();
    const args = makeBaseArgs({
      logger,
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    });
    const result = await processDiscoveryResults(args);
    assert.equal(result.enabled, true);
    assert.equal(result.candidates.length, 0, 'failure = zero candidates, no deterministic fallback');
  });

  it('invalid output produces zero candidates (no fallback)', async () => {
    const logger = makeStubLogger();
    const args = makeBaseArgs({
      logger,
      _serpSelectorCallFn: async () => {
        return { keep_ids: ['FAKE_UNKNOWN_ID'] };
      },
    });
    const result = await processDiscoveryResults(args);
    assert.equal(result.candidates.length, 0, 'invalid output = zero candidates');
    const warnEvents = logger.events.filter((e) => e.event === 'serp_selector_invalid_output');
    assert.ok(warnEvents.length >= 1, 'logged serp_selector_invalid_output');
  });

  it('return value has all required top-level keys', async () => {
    const result = await processDiscoveryResults(makeBaseArgs({
      _serpSelectorCallFn: async ({ selectorInput }) => {
        const ids = selectorInput.candidates.map((c) => c.id);
        return makeSelectorOutput(ids);
      },
    }));
    assert.equal(result.enabled, true);
    assert.equal(typeof result.discoveryKey, 'string');
    assert.equal(typeof result.candidatesKey, 'string');
    assert.ok(Array.isArray(result.candidates));
    assert.ok(Array.isArray(result.approvedUrls));
    assert.ok(Array.isArray(result.candidateUrls));
    assert.ok(Array.isArray(result.queries));
    assert.ok(typeof result.search_profile === 'object');
    assert.ok(typeof result.serp_explorer === 'object');
  });

  it('serpExplorer has llm_selector fields', async () => {
    const result = await processDiscoveryResults(makeBaseArgs({
      _serpSelectorCallFn: async ({ selectorInput }) => {
        const ids = selectorInput.candidates.map((c) => c.id);
        return makeSelectorOutput(ids);
      },
    }));
    assert.equal(result.serp_explorer.llm_selector_enabled, true);
    assert.equal(result.serp_explorer.llm_selector_applied, true);
    assert.equal(typeof result.serp_explorer.llm_selector_model, 'string');
  });

  it('selected candidates have score_source=llm_selector', async () => {
    const result = await processDiscoveryResults(makeBaseArgs({
      _serpSelectorCallFn: async ({ selectorInput }) => {
        const ids = selectorInput.candidates.map((c) => c.id);
        return makeSelectorOutput(ids);
      },
    }));
    for (const candidate of result.candidates) {
      assert.equal(candidate.score_source, 'llm_selector');
    }
  });

  it('lane_stats has _compatibility flag', async () => {
    const result = await processDiscoveryResults(makeBaseArgs({
      _serpSelectorCallFn: async ({ selectorInput }) => {
        const ids = selectorInput.candidates.map((c) => c.id);
        return makeSelectorOutput(ids);
      },
    }));
    assert.equal(result.serp_explorer.lane_stats._compatibility, true);
  });
});
