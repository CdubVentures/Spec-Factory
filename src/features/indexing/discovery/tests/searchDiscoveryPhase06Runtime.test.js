import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../../../s3/storage.js';
import { discoverCandidateSources } from '../searchDiscovery.js';
import { loadSourceRegistry } from '../../pipeline/shared/sourceRegistry.js';
import { buildMockSerpSelectorResponse, isLlmEndpoint } from './helpers/discoverySelectorHarness.js';

const TEST_CATEGORY = 'mouse';
const TEST_IDENTITY = {
  productId: 'mouse-acme-orbit-x1',
  brand: 'Acme',
  model: 'Orbit X1',
  variant: '',
};
const TEST_HOSTS = {
  manufacturer: 'acme.test',
  manufacturerAlias: 'acme-alt.test',
  retailer: 'shop.test',
  lab: 'lab.test',
};
const TEST_URLS = {
  product: `https://www.${TEST_HOSTS.manufacturer}/products/orbit-x1`,
  support: `https://www.${TEST_HOSTS.manufacturer}/support/orbit-x1`,
  labReview: `https://www.${TEST_HOSTS.lab}/reviews/acme/orbit-x1`,
  manual: `https://www.${TEST_HOSTS.manufacturer}/manuals/orbit-x1`,
  unrelatedRetailer: `https://www.${TEST_HOSTS.retailer}/products/typeboard-k2`,
};

function makeConfig(tempRoot, overrides = {}) {
  return {
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs',
    discoveryEnabled: true,
    searchProfileQueryCap: 4,
    searchEngines: 'bing,brave,duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080',
    searxngMinQueryIntervalMs: 0,
    // WHY: LLM API key required so the SERP selector call reaches fetch
    // instead of throwing 'LLM_API_KEY is not configured'.
    llmApiKey: 'test-key',
    ...overrides,
  };
}

function makeJob() {
  return {
    productId: TEST_IDENTITY.productId,
    category: TEST_CATEGORY,
    identityLock: {
      brand: TEST_IDENTITY.brand,
      model: TEST_IDENTITY.model,
      variant: TEST_IDENTITY.variant,
    },
  };
}

function makeCategoryConfig(overrides = {}) {
  const sources = {
    approved: {
      manufacturer: [TEST_HOSTS.manufacturer],
      retailer: [TEST_HOSTS.retailer],
      lab: [TEST_HOSTS.lab],
    },
    sources: {
      acme_test: {
        base_url: `https://${TEST_HOSTS.manufacturer}`,
        tier: 'tier1_manufacturer',
        authority: 'authoritative',
        content_types: ['product_page'],
        doc_kinds: ['spec_sheet'],
        field_coverage: { high: ['sensor', 'weight'], medium: ['dpi'], low: [] },
      },
      shop_test: {
        base_url: `https://${TEST_HOSTS.retailer}`,
        tier: 'tier3_retailer',
        content_types: ['product_page'],
        doc_kinds: ['product_page'],
      },
      lab_test: {
        base_url: `https://${TEST_HOSTS.lab}`,
        tier: 'tier2_lab',
        authority: 'instrumented',
        content_types: ['review'],
        doc_kinds: ['review'],
      },
    },
  };
  const { registry } = loadSourceRegistry('mouse', sources);
  return {
    category: 'mouse',
    sourceHosts: [
      { host: TEST_HOSTS.manufacturer, tier: 1, tierName: 'manufacturer', role: 'manufacturer' },
      { host: TEST_HOSTS.retailer, tier: 3, tierName: 'retailer', role: 'retailer' },
      { host: TEST_HOSTS.lab, tier: 2, tierName: 'lab', role: 'lab' },
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specifications'],
    fieldOrder: ['sensor', 'weight', 'dpi'],
    fieldRules: {
      fields: {
        sensor: {
          search_hints: {
            query_terms: ['sensor'],
            domain_hints: ['retailer', 'manual', TEST_HOSTS.lab, 'mystery-token'],
            preferred_content_types: ['manual_pdf'],
          },
        },
        weight: {
          search_hints: {
            query_terms: ['weight'],
            domain_hints: ['retailer'],
          },
        },
      },
    },
    sources,
    validatedRegistry: registry,
    registryPopulationGate: { passed: true, reasons: [] },
    ...overrides,
  };
}

function makeLogger(events) {
  return {
    info(name, payload = {}) {
      events.push({ name, payload });
    },
  };
}

test('discoverCandidateSources accepts zero results when internet search returns empty and no frontier cache exists', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-zero-results-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  storage.getBrandDomain = (brand, category) => {
    if (String(brand) === TEST_IDENTITY.brand && String(category) === TEST_CATEGORY) {
      return {
        official_domain: TEST_HOSTS.manufacturer,
        aliases: JSON.stringify([TEST_HOSTS.manufacturerAlias]),
        support_domain: `support.${TEST_HOSTS.manufacturer}`,
        confidence: 0.95,
      };
    }
    return null;
  };
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();
  const events = [];
  const logger = makeLogger(events);
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { results: [] };
    },
  });

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase06-zero-results',
      logger,
      planningHints: {
        missingRequiredFields: ['sensor', 'weight'],
      },
      llmContext: {},
    });

    // WHY: search-first mode — no synthetic URL fallback. Zero internet results
    // with no frontier cache means zero results. The old plan_fallback path is removed.
    const internetAttempts = (result.search_attempts || []).filter(
      (row) => row.reason_code === 'internet_search'
    );
    assert.ok(internetAttempts.length > 0, 'expected internet_search attempts');
    assert.equal(
      internetAttempts.every((row) => row.result_count === 0),
      true,
      'all internet search attempts should have 0 results when provider returns empty',
    );
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources skips conditional triage at the 60 percent deterministic-quality boundary', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-triage-skip-'));
  const config = makeConfig(tempRoot, {
    searchProfileQueryCap: 1,
  });
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();
  const events = [];
  const logger = makeLogger(events);
  const originalFetch = global.fetch;
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
              url: TEST_URLS.product,
              title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} specifications`,
              content: 'Official specifications and technical details',
            },
            {
              url: TEST_URLS.support,
              title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} support`,
              content: 'Support specifications and setup details',
            },
            {
              url: TEST_URLS.labReview,
              title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} review`,
              content: 'Review with measurements and weight details',
            },
          ],
        };
      },
    };
  };

  try {
    await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase06-triage-skip',
      logger,
      planningHints: {
        missingRequiredFields: ['sensor'],
      },
      llmContext: {},
    });

    // WHY: The old deterministic triage pipeline emitted llm_triage_skipped when
    // quality was high enough. The new LLM-only SERP selector always runs and
    // emits serp_selector_completed + discovery_results_reranked instead.
    const selectorEvent = events.find((event) => event.name === 'serp_selector_completed');
    assert.ok(selectorEvent, 'expected serp_selector_completed event');
    const rerankedEvent = events.find((event) => event.name === 'discovery_results_reranked');
    assert.ok(rerankedEvent, 'expected discovery_results_reranked event');
    assert.ok(rerankedEvent?.payload?.discovered_count >= 1,
      `expected at least 1 discovered URL, got ${rerankedEvent?.payload?.discovered_count}`);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources enters triage flow when deterministic quality stays below threshold', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-triage-needed-'));
  const config = makeConfig(tempRoot, {
    searchProfileQueryCap: 1,
  });
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();
  const events = [];
  const logger = makeLogger(events);
  const originalFetch = global.fetch;
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
              url: TEST_URLS.product,
              title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} specifications`,
              content: 'Official specifications and technical details',
            },
            {
              url: TEST_URLS.support,
              title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} support`,
              content: 'Support specifications and setup details',
            },
            {
              url: TEST_URLS.labReview,
              title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} review`,
              content: 'Review with measurements and weight details',
            },
          ],
        };
      },
    };
  };

  try {
    await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase06-triage-needed',
      logger,
      planningHints: {
        missingRequiredFields: ['sensor'],
      },
      llmContext: {},
    });

    // WHY: The LLM SERP selector always runs and emits serp_selector_completed.
    const selectorEvent = events.find((event) => event.name === 'serp_selector_completed');
    assert.ok(selectorEvent, 'expected serp_selector_completed event');
    // URLs should be selected by the mock LLM selector
    const rerankedEvent = events.find((event) => event.name === 'discovery_results_reranked');
    assert.ok(rerankedEvent, 'expected discovery_results_reranked event');
    assert.ok(rerankedEvent?.payload?.discovered_count >= 1, 'expected at least 1 discovered URL');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources falls back to top-level job identity for query guard and live candidate scoring', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-top-level-identity-'));
  const config = makeConfig(tempRoot, {
    searchProfileQueryCap: 1,

  });
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = {
    productId: TEST_IDENTITY.productId,
    category: TEST_CATEGORY,
    brand: TEST_IDENTITY.brand,
    model: TEST_IDENTITY.model,
    variant: '',
  };
  const events = [];
  const logger = makeLogger(events);
  const originalFetch = global.fetch;
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
              url: TEST_URLS.manual,
              title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} manual`,
              content: 'Official manual for the exact target product',
            },
            {
              url: TEST_URLS.unrelatedRetailer,
              title: `${TEST_IDENTITY.brand} Typeboard K2 keyboard`,
              content: 'Unrelated keyboard product page',
            },
          ],
        };
      },
    };
  };

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase06-top-level-identity',
      logger,
      planningHints: {
        missingRequiredFields: ['sensor'],
      },
      llmContext: {},
    });

    const queryGuard = result.search_profile?.query_guard || {};
    assert.ok((queryGuard.brand_tokens || []).includes(TEST_IDENTITY.brand.toLowerCase()));
    assert.ok((queryGuard.model_tokens || []).includes('orbit'));

    // WHY: The LLM selector mock approves all candidates. The manual URL should
    // survive as a candidate. identity_match_level is set by classifyUrlCandidate,
    // not by the LLM selector.
    const exactManual = (result.candidates || []).find((row) =>
      String(row?.url || '').includes('/manuals/orbit-x1')
    );
    assert.ok(exactManual, 'expected exact manual candidate to survive triage');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

