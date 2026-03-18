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
    searchProvider: 'searxng',
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
    searchProvider: 'dual',
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

  const originalFetch = global.fetch;
  global.fetch = async () => ({
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
  });

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-logger-profile',
      logger,
      planningHints: {},
      llmContext: {}
    });

    assert.equal(Array.isArray(result.search_profile?.query_rows), true);
    assert.equal(events.some((event) => event.name === 'search_profile_generated'), true);
    const plannerEvent = events.find((event) => event.name === 'search_plan_generated');
    assert.equal(Boolean(plannerEvent), true, 'expected deterministic search planner event');
    assert.equal(String(plannerEvent?.payload?.pass_name || ''), 'deterministic_fallback');
    assert.equal(Array.isArray(plannerEvent?.payload?.queries_generated), true);
    assert.equal((plannerEvent?.payload?.queries_generated || []).length > 0, true);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources resolves brand from cache via deterministic path', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-brand-cache-'));
  const config = makeConfig(tempRoot, {
    searchProvider: 'google',
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
      llmContext: {}
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
    searchProvider: 'searxng',
    serpTriageEnabled: true,
    serpTriageMaxUrls: 2
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
  global.fetch = async () => ({
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
  });

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

    const triageEvent = events.find((event) => event.name === 'serp_triage_completed');
    assert.equal(Boolean(triageEvent), true, 'expected deterministic triage event');
    assert.equal(Array.isArray(triageEvent?.payload?.candidates), true);
    assert.equal((triageEvent?.payload?.candidates || []).length > 0, true);
    assert.equal((triageEvent?.payload?.kept_count || 0) > 0, true);

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
    searchProvider: 'google',
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
    searchProvider: 'dual',
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

  const originalFetch = global.fetch;
  global.fetch = async () => ({
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
  });

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-provider-diag',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    assert.equal((result.provider_state?.active_providers || []).includes('searxng'), true);
    assert.equal(Object.hasOwn(result.provider_state || {}, 'google_missing_credentials'), false);
    assert.equal(Object.hasOwn(result.provider_state || {}, 'bing_missing_credentials'), false);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources filters low-signal review URLs (rss/opensearch/search pages)', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-relevance-filter-'));
  const config = makeConfig(tempRoot, {
    searchProvider: 'searxng'
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
  global.fetch = async () => ({
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
  });

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

    const urls = [...new Set([...(result.approvedUrls || []), ...(result.candidateUrls || [])])];
    assert.equal(
      urls.includes('https://www.rtings.com/mouse/reviews/hyperx/pulsefire-haste-2-core-wireless'),
      true
    );
    assert.equal(urls.some((url) => url.includes('/opensearch.xml')), false);
    assert.equal(urls.some((url) => url.includes('/latest-rss.xml')), false);
    assert.equal(urls.some((url) => url.includes('/search?q=')), false);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
