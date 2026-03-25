/**
 * Tests for deterministic reranker fallback when LLM SERP selector fails.
 * The reranker scores candidates by host tier, identity, field yield, and
 * path patterns — then the top-N by score become the fallback keep_ids.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processDiscoveryResults } from '../processDiscoveryResults.js';

// ---------------------------------------------------------------------------
// Fixture factories (aligned with serpSelectorIntegration.test.js)
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
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    providerState: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SERP Selector deterministic reranker fallback', () => {
  it('fallback produces selected URLs on LLM throw', async () => {
    const args = makeBaseArgs({
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    });
    const result = await processDiscoveryResults(args);
    assert.equal(result.enabled, true);
    assert.ok(result.selectedUrls.length > 0, 'fallback should produce non-zero selected URLs');
  });

  it('fallback produces selected URLs on invalid output', async () => {
    const args = makeBaseArgs({
      _serpSelectorCallFn: async () => ({ keep_ids: ['FAKE_UNKNOWN_ID'] }),
    });
    const result = await processDiscoveryResults(args);
    assert.ok(result.selectedUrls.length > 0, 'fallback should produce non-zero selected URLs on invalid output');
  });

  it('fallback respects max_keep cap', async () => {
    const args = makeBaseArgs({
      config: { llmModelPlan: 'test-model', s3InputPrefix: '_test', serpSelectorUrlCap: 2 },
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    });
    const result = await processDiscoveryResults(args);
    assert.ok(result.selectedUrls.length <= 2, `expected <= 2 selected URLs, got ${result.selectedUrls.length}`);
  });

  it('fallback candidates have score_source=passthrough_fallback', async () => {
    const args = makeBaseArgs({
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    });
    const result = await processDiscoveryResults(args);
    const fetchHigh = result.candidates.filter((c) => c.triage_disposition === 'fetch_high');
    assert.ok(fetchHigh.length > 0, 'should have fetch_high candidates');
    for (const c of fetchHigh) {
      assert.equal(c.score_breakdown.score_source, 'passthrough_fallback',
        `expected passthrough_fallback, got ${c.score_breakdown.score_source} for ${c.url}`);
    }
  });

  it('fallback selected have soft_reason_codes containing passthrough_fallback', async () => {
    const args = makeBaseArgs({
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    });
    const result = await processDiscoveryResults(args);
    const fetchHigh = result.candidates.filter((c) => c.triage_disposition === 'fetch_high');
    for (const c of fetchHigh) {
      assert.ok(
        (c.soft_reason_codes || []).includes('passthrough_fallback'),
        `expected passthrough_fallback in soft_reason_codes for ${c.url}`,
      );
    }
  });

  it('fallback logs serp_selector_fallback_activated', async () => {
    const logger = makeStubLogger();
    const args = makeBaseArgs({
      logger,
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    });
    await processDiscoveryResults(args);
    const fallbackEvents = logger.events.filter((e) => e.event === 'serp_selector_fallback_activated');
    assert.ok(fallbackEvents.length >= 1, 'should log serp_selector_fallback_activated');
    assert.equal(typeof fallbackEvents[0].payload.fallback_count, 'number');
    assert.equal(typeof fallbackEvents[0].payload.max_keep, 'number');
  });

  it('fallback return shape identical to LLM success path', async () => {
    const result = await processDiscoveryResults(makeBaseArgs({
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    }));
    assert.equal(result.enabled, true);
    assert.equal(typeof result.discoveryKey, 'string');
    assert.equal(typeof result.candidatesKey, 'string');
    assert.ok(Array.isArray(result.candidates));
    assert.ok(Array.isArray(result.selectedUrls));
    assert.ok(Array.isArray(result.allCandidateUrls));
    assert.ok(Array.isArray(result.queries));
    assert.ok(typeof result.search_profile === 'object');
    assert.ok(typeof result.serp_explorer === 'object');
  });

  it('fallback preserves priority order (pinned first)', async () => {
    const args = makeBaseArgs({
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    });
    const result = await processDiscoveryResults(args);
    // razer.com is officialDomain — pinned first by buildSerpSelectorInput
    assert.ok(result.selectedUrls.length >= 1, 'should have at least one selected URL');
    assert.ok(
      result.selectedUrls[0].includes('razer.com'),
      `expected razer.com first (pinned), got ${result.selectedUrls[0]}`,
    );
  });

  it('no fallback when LLM succeeds — score_source is llm_selector', async () => {
    const args = makeBaseArgs({
      _serpSelectorCallFn: async ({ selectorInput }) => {
        const ids = selectorInput.candidates.map((c) => c.id);
        return { keep_ids: ids };
      },
    });
    const result = await processDiscoveryResults(args);
    for (const c of result.candidates) {
      assert.equal(c.score_source, 'llm_selector',
        `expected llm_selector on success path, got ${c.score_source} for ${c.url}`);
    }
  });

  it('fallback with zero candidates produces zero selected', async () => {
    const args = makeBaseArgs({
      rawResults: [],
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    });
    const result = await processDiscoveryResults(args);
    assert.equal(result.selectedUrls.length, 0, 'zero candidates means zero selected');
  });

  it('serp_explorer.fallback_applied is true on fallback', async () => {
    const result = await processDiscoveryResults(makeBaseArgs({
      _serpSelectorCallFn: async () => { throw new Error('timeout'); },
    }));
    assert.equal(result.serp_explorer.fallback_applied, true);
  });

  it('serp_explorer.fallback_applied is false on LLM success', async () => {
    const result = await processDiscoveryResults(makeBaseArgs({
      _serpSelectorCallFn: async ({ selectorInput }) => {
        return { keep_ids: selectorInput.candidates.map((c) => c.id) };
      },
    }));
    assert.equal(result.serp_explorer.fallback_applied, false);
  });
});
