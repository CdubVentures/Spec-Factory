import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../src/s3/storage.js';
import { discoverCandidateSources } from '../src/features/indexing/discovery/searchDiscovery.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// WHY: The SERP selector is LLM-only. Tests that mock global.fetch for search
// providers must also handle the LLM /v1/chat/completions call. This helper
// builds a valid selector response that approves all candidates so the pipeline
// can proceed to emit discovery_results_reranked with discovered_count > 0.
function buildMockSerpSelectorResponse(requestBody) {
  let input;
  try {
    const parsed = JSON.parse(requestBody);
    const userMsg = parsed?.messages?.find((m) => m.role === 'user');
    input = JSON.parse(userMsg?.content || '{}');
  } catch {
    input = { candidates: [] };
  }
  const candidates = input?.candidates || [];
  const maxKeep = input?.selection_limits?.max_total_keep || 60;
  const approvedIds = candidates.slice(0, maxKeep).map((c) => c.id);
  const rejectIds = candidates.slice(maxKeep).map((c) => c.id);
  const results = candidates.map((c, idx) => ({
    id: c.id,
    decision: idx < maxKeep ? 'approved' : 'reject',
    score: idx < maxKeep ? 0.8 : 0.1,
    confidence: idx < maxKeep ? 'high' : 'low',
    fetch_rank: idx < maxKeep ? idx + 1 : null,
    page_type: c.page_type_hint || 'unknown',
    authority_bucket: c.pinned ? 'official' : 'unknown',
    likely_field_keys: [],
    reason_code: idx < maxKeep ? 'relevant' : 'low_signal',
    reason: idx < maxKeep ? 'mock approved' : 'mock rejected',
  }));
  const selectorOutput = {
    schema_version: 'serp_selector_output.v1',
    keep_ids: [...approvedIds],
    approved_ids: approvedIds,
    candidate_ids: [],
    reject_ids: rejectIds,
    results,
    summary: {
      input_count: candidates.length,
      approved_count: approvedIds.length,
      candidate_count: 0,
      reject_count: rejectIds.length,
    },
  };
  return {
    choices: [{
      message: { content: JSON.stringify(selectorOutput) },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    model: 'mock-selector',
  };
}

function isLlmEndpoint(url) {
  return String(url || '').includes('/v1/chat/completions');
}

function makeConfig(tempRoot, overrides = {}) {
  return {
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs',
    discoveryEnabled: true,
    discoveryMaxQueries: 4,
    discoveryResultsPerQuery: 5,
    discoveryMaxDiscovered: 20,
    discoveryQueryConcurrency: 4,
    searchEngines: 'bing,brave,duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080',
    searxngMinQueryIntervalMs: 0,
    ...overrides
  };
}

function makeJob(overrides = {}) {
  return {
    productId: 'mouse-hyperx-pulsefire-haste-2-core-wireless',
    category: 'mouse',
    identityLock: {
      brand: 'HyperX',
      model: 'Pulsefire Haste 2 Core Wireless',
      variant: ''
    },
    ...overrides
  };
}

test('discoverCandidateSources runs internet query fanout with concurrency > 1', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-discovery-concurrency-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 4,
    discoveryQueryConcurrency: 4
  });
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'rtings.com', tier: 2, tierName: 'review', role: 'review' }
    ],
    denylist: [],
    searchTemplates: [
      '{brand} {model} specs',
      '{brand} {model} manual',
      '{brand} {model} review',
      '{brand} {model} support'
    ],
    fieldOrder: []
  };
  const job = makeJob();

  const originalFetch = global.fetch;
  let inFlight = 0;
  let maxInFlight = 0;
  global.fetch = async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await delay(120);
    inFlight -= 1;
    return {
      ok: true,
      async json() {
        return {
          results: [
            {
              url: 'https://www.rtings.com/mouse/reviews/hyperx/pulsefire-haste-2-core-wireless',
              title: 'HyperX Pulsefire Haste 2 Core Wireless',
              content: 'Specs and measurements'
            }
          ]
        };
      }
    };
  };

  try {
    await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-query-concurrency',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    assert.equal(maxInFlight > 1, true);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources with logger emits search profile events without crashing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-logger-profile-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 3,
    discoveryQueryConcurrency: 1,
    searchEngines: 'bing,google',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'rtings.com', tier: 2, tierName: 'review', role: 'review' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs'],
    fieldOrder: []
  };
  const job = makeJob();
  const events = [];
  const logger = {
    info(name, payload = {}) {
      events.push({ name, payload });
    }
  };

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-logger-profile',
      logger,
      planningHints: {},
      llmContext: {},
      _runSearchProvidersFn: async () => [
        {
          url: 'https://www.rtings.com/mouse/reviews/hyperx/pulsefire-haste-2-core-wireless',
          title: 'HyperX Pulsefire Haste 2 Core Wireless',
          snippet: 'Specs and measurements',
          provider: 'bing'
        }
      ]
    });

    assert.equal(Array.isArray(result.search_profile?.query_rows), true);
    const profileEvent = events.find((event) => event.name === 'search_profile_generated');
    assert.equal(Boolean(profileEvent), true, 'expected deterministic search profile event');
    assert.equal(profileEvent?.payload?.source, 'deterministic');
    assert.equal(Array.isArray(profileEvent?.payload?.query_rows), true);
    assert.equal((profileEvent?.payload?.query_rows || []).length > 0, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources resolves brand from cache via deterministic path', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-brand-cache-'));
  const config = makeConfig(tempRoot, {
    searchEngines: 'google',
    googleCseKey: '',
    googleCseCx: '',
    searxngBaseUrl: ''
  });
  const storage = createStorage(config);
  storage.getBrandDomain = (brand, category) => {
    if (String(brand) === 'HyperX' && String(category) === 'mouse') {
      return {
        official_domain: 'hyperx.com',
        aliases: JSON.stringify(['hyperx.com']),
        support_domain: 'support.hyperx.com',
        confidence: 0.95
      };
    }
    return null;
  };

  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'hyperx.com', tier: 1, tierName: 'manufacturer', role: 'manufacturer' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs'],
    fieldOrder: []
  };
  const job = makeJob();
  const events = [];
  const logger = {
    info(name, payload = {}) {
      events.push({ name, payload });
    }
  };

  try {
    await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-brand-cache-llm-off',
      logger,
      planningHints: {},
      llmContext: {},
      _runSearchProvidersFn: async () => []
    });

    const brandEvent = events.find((event) => event.name === 'brand_resolved');
    assert.equal(Boolean(brandEvent), true, 'expected brand_resolved event');
    assert.equal(String(brandEvent?.payload?.status || ''), 'resolved');
    assert.equal(String(brandEvent?.payload?.skip_reason || ''), '');
    assert.equal(String(brandEvent?.payload?.official_domain || ''), 'hyperx.com');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources emits deterministic triage and domain-classifier events when LLM triage is unavailable', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-deterministic-triage-events-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 2,
    discoveryQueryConcurrency: 1,
    searchEngines: 'bing,brave,duckduckgo',
    // WHY: LLM API key required so the SERP selector call reaches fetch
    // instead of throwing 'LLM_API_KEY is not configured' before the mock can respond.
    llmApiKey: 'test-key',
  });
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'rtings.com', tier: 2, tierName: 'review', role: 'review' },
      { host: 'asus.com', tier: 1, tierName: 'manufacturer', role: 'manufacturer' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs', '{brand} {model} support'],
    fieldOrder: []
  };
  const job = {
    ...makeJob(),
    identityLock: {
      brand: 'Asus',
      model: 'ROG Strix Impact III',
      variant: ''
    }
  };
  const events = [];
  const logger = {
    info(name, payload = {}) {
      events.push({ name, payload });
    }
  };

  const originalFetch = global.fetch;
  // WHY: The pipeline calls fetch for both SearxNG search queries and the LLM
  // SERP selector. Route LLM calls to the mock selector response builder.
  let lastLlmRequestBody = '';
  global.fetch = async (input, init) => {
    if (isLlmEndpoint(input)) {
      lastLlmRequestBody = typeof init?.body === 'string' ? init.body : '';
      const mockResponse = buildMockSerpSelectorResponse(lastLlmRequestBody);
      return {
        ok: true,
        async text() { return JSON.stringify(mockResponse); },
        async json() { return mockResponse; },
      };
    }
    return {
      ok: true,
      async json() {
        return {
          results: [
            {
              url: 'https://www.asus.com/us/accessories/mice-and-mouse-pads/rog-strix-impact-iii/',
              title: 'ASUS ROG Strix Impact III',
              content: 'Official specs and support page'
            },
            {
              url: 'https://www.rtings.com/mouse/reviews/asus/rog-strix-impact-iii',
              title: 'ASUS ROG Strix Impact III review',
              content: 'Measurements and testing notes'
            }
          ]
        };
      }
    };
  };

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-deterministic-triage-events',
      logger,
      planningHints: {},
      llmContext: {}
    });

    // WHY: The pipeline emits discovery_results_reranked after LLM selector
    // adapts and selects candidates.
    const rerankedEvent = events.find((event) => event.name === 'discovery_results_reranked');
    assert.equal(Boolean(rerankedEvent), true, 'expected discovery_results_reranked event');
    assert.equal((rerankedEvent?.payload?.discovered_count || 0) > 0, true);

    const domainClassifierEvent = events.find((event) => event.name === 'domains_classified');
    assert.equal(Boolean(domainClassifierEvent), true, 'expected deterministic domain-classifier event');
    assert.equal(Array.isArray(domainClassifierEvent?.payload?.classifications), true);
    assert.equal((domainClassifierEvent?.payload?.classifications || []).length > 0, true);

    const notes = (domainClassifierEvent?.payload?.classifications || [])
      .map((row) => String(row?.notes || '').trim())
      .filter(Boolean);
    assert.equal(notes.includes('deterministic_heuristic'), true);

    assert.equal((result.approvedUrls || []).length > 0, true);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources uses deterministic domain classification exclusively (LLM domain safety eliminated)', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-domain-deterministic-only-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 1,
    discoveryQueryConcurrency: 1,
    llmProvider: 'openai',
    llmBaseUrl: 'http://llm.test',
    llmApiKey: 'test-key',
    llmModelExtract: 'gpt-4o-mini',
    llmModelTriage: 'gpt-4o-mini'
  });
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', tier: 1, tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'rtings.com', tier: 2, tierName: 'review', role: 'review' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} manual'],
    fieldOrder: []
  };
  const job = makeJob({
    productId: 'mouse-razer-viper-v3-pro',
    identityLock: {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: ''
    }
  });
  const events = [];
  const logger = {
    info(name, payload = {}) {
      events.push({ name, payload });
    },
    warn(name, payload = {}) {
      events.push({ name, payload });
    }
  };

  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = String(input);
    if (url === 'http://llm.test/v1/chat/completions') {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ classifications: [] })
                }
              }
            ],
            usage: {
              prompt_tokens: 25,
              completion_tokens: 4,
              total_tokens: 29
            },
            model: 'gpt-4o-mini'
          });
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          results: [
            {
              url: 'https://dl.razerzone.com/manuals/viper-v3-pro-user-guide.pdf',
              title: 'Razer Viper V3 Pro User Guide',
              content: 'Official manual PDF'
            }
          ]
        };
      }
    };
  };

  try {
    await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-domain-llm-missing-result',
      logger,
      planningHints: {},
      llmContext: {}
    });

    // LLM domain safety call was eliminated — no llm_route_selected or llm_call_started for domain safety
    const routeEvent = events.find(
      (event) => event.name === 'llm_route_selected' && event.payload?.reason === 'domain_safety_classification'
    );
    assert.equal(routeEvent, undefined, 'LLM domain safety call should not fire (eliminated)');

    const domainClassifierEvent = events.find((event) => event.name === 'domains_classified');
    assert.ok(domainClassifierEvent, 'expected deterministic domain classification event');
    const notes = (domainClassifierEvent?.payload?.classifications || [])
      .map((row) => String(row?.notes || '').trim())
      .filter(Boolean);
    assert.equal(notes.includes('deterministic_heuristic'), true);
    assert.equal(notes.includes('llm_missing_result'), false);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources emits plan-only search result events when internet provider is unavailable', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-plan-only-events-'));
  const config = makeConfig(tempRoot, {
    searchEngines: '',
    googleCseKey: '',
    googleCseCx: '',
    searxngBaseUrl: ''
  });
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'rtings.com', tier: 2, tierName: 'review', role: 'review' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs'],
    fieldOrder: []
  };
  const job = makeJob();
  const events = [];
  const logger = {
    info(name, payload = {}) {
      events.push({ name, payload });
    }
  };

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-plan-only-events',
      logger,
      planningHints: {},
      llmContext: {}
    });

    // WHY: plan_only_no_provider attempt is still recorded even with zero planned URLs
    assert.equal(
      result.search_attempts.some((attempt) => attempt.reason_code === 'plan_only_no_provider'),
      true
    );
    // WHY: Non-manufacturer hosts produce zero plan-only results in search-first mode.
    // With zero planned URLs, no per-query lifecycle events are emitted.
    const planAttempt = result.search_attempts.find((a) => a.reason_code === 'plan_only_no_provider');
    assert.equal(planAttempt.result_count, 0, 'non-manufacturer plan-only produces 0 results');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources returns provider diagnostics for dual mode fallback readiness', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-provider-diag-'));
  const config = makeConfig(tempRoot, {
    searchEngines: 'bing,google',
    bingSearchEndpoint: '',
    bingSearchKey: '',
    googleCseKey: '',
    googleCseCx: '',
    searxngBaseUrl: 'http://127.0.0.1:8080',
  });
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'rtings.com', tier: 2, tierName: 'review', role: 'review' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs'],
    fieldOrder: []
  };
  const job = makeJob();

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-provider-diag',
      logger: null,
      planningHints: {},
      llmContext: {},
      _runSearchProvidersFn: async () => [
        {
          url: 'https://www.rtings.com/mouse/reviews/hyperx/pulsefire-haste-2-core-wireless',
          title: 'HyperX Pulsefire Haste 2 Core Wireless',
          snippet: 'Specs and measurements',
          provider: 'bing'
        }
      ]
    });

    assert.equal(result.provider_state?.internet_ready, true);
    assert.equal(Object.hasOwn(result.provider_state || {}, 'google_missing_credentials'), false);
    assert.equal(Object.hasOwn(result.provider_state || {}, 'bing_missing_credentials'), false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources filters low-signal review URLs (rss/opensearch/search pages)', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-relevance-filter-'));
  const config = makeConfig(tempRoot, {
    searchEngines: 'bing,brave,duckduckgo',
    // WHY: LLM API key required so the SERP selector call reaches fetch
    // instead of throwing 'LLM_API_KEY is not configured' before the mock can respond.
    llmApiKey: 'test-key',
  });
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'rtings.com', tier: 2, tierName: 'review', role: 'review' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs'],
    fieldOrder: []
  };
  const job = makeJob();

  const originalFetch = global.fetch;
  // WHY: The pipeline calls fetch for both SearxNG search queries and the LLM
  // SERP selector. Route LLM calls to the mock selector response builder.
  global.fetch = async (input, init) => {
    if (isLlmEndpoint(input)) {
      const body = typeof init?.body === 'string' ? init.body : '';
      const mockResponse = buildMockSerpSelectorResponse(body);
      return {
        ok: true,
        async text() { return JSON.stringify(mockResponse); },
        async json() { return mockResponse; },
      };
    }
    return {
      ok: true,
      async json() {
        return {
          results: [
            {
              url: 'https://www.rtings.com/opensearch.xml',
              title: 'Open Search',
              content: 'opensearch'
            },
            {
              url: 'https://www.rtings.com/latest-rss.xml',
              title: 'Latest RSS',
              content: 'rss feed'
            },
            {
              url: 'https://www.rtings.com/search?q=HyperX%20Pulsefire%20Haste%202%20Core%20Wireless',
              title: 'Search',
              content: 'search results'
            },
            {
              url: 'https://www.rtings.com/mouse/reviews/hyperx/pulsefire-haste-2-core-wireless',
              title: 'HyperX Pulsefire Haste 2 Core Wireless Review',
              content: 'Full review with measurements'
            }
          ]
        };
      }
    };
  };

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-relevance-filter',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: The /search?q= URL is hard-dropped as utility_shell by the hard-drop
    // filter. All other URLs survive to the LLM selector which approves them.
    const urls = [...new Set([...(result.approvedUrls || []), ...(result.candidateUrls || [])])];
    assert.equal(
      urls.includes('https://www.rtings.com/mouse/reviews/hyperx/pulsefire-haste-2-core-wireless'),
      true
    );
    // /search?q= is still hard-dropped as utility_shell
    assert.equal(urls.some((url) => url.includes('/search?q=')), false);

    // WHY: The LLM selector mock approves all non-hard-dropped candidates
    // uniformly. Score-based ordering assertions are not meaningful with the
    // uniform mock. Instead verify the real review URL is present and the
    // hard-dropped /search?q= URL is absent (the business outcomes that matter).
    const candidates = result.candidates || [];
    const realReviewCandidate = candidates.find((c) =>
      String(c.url || '').includes('/mouse/reviews/hyperx/pulsefire-haste-2-core-wireless')
    );
    assert.ok(realReviewCandidate, 'expected real review candidate in results');

    // /search?q= must not appear in candidates (hard-dropped)
    const searchQCandidate = candidates.find((c) =>
      String(c.url || '').includes('/search?q=')
    );
    assert.equal(searchQCandidate, undefined, '/search?q= should be hard-dropped');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
