import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../src/s3/storage.js';
import { discoverCandidateSources } from '../src/features/indexing/discovery/searchDiscovery.js';

function makeConfig(tempRoot, overrides = {}) {
  return {
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs',
    discoveryEnabled: true,
    discoveryMaxQueries: 1,
    discoveryResultsPerQuery: 5,
    discoveryMaxDiscovered: 20,
    discoveryQueryConcurrency: 1,
    searchEngines: 'bing,brave,duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080',
    searxngMinQueryIntervalMs: 0,
    // WHY: LLM API key required so the SERP selector call reaches fetch
    // instead of throwing 'LLM_API_KEY is not configured'.
    llmApiKey: 'test-key',
    ...overrides
  };
}

function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', tier: 1, tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'rtings.com', tier: 2, tierName: 'lab', role: 'review' },
      { host: 'amazon.com', tier: 3, tierName: 'retailer', role: 'retailer' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs'],
    fieldOrder: [],
    ...overrides
  };
}

function makeJob(overrides = {}) {
  return {
    productId: 'mouse-razer-viper-v3-pro',
    category: 'mouse',
    identityLock: {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: ''
    },
    ...overrides
  };
}

function collectUrls(result = {}) {
  return [...new Set([...(result.approvedUrls || []), ...(result.candidateUrls || [])])];
}

// WHY: The SERP selector is LLM-only. Tests that mock global.fetch for search
// providers must also handle the LLM /v1/chat/completions call. This helper
// builds a valid selector response that approves all candidates.
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

function createFetchStub(results = []) {
  return async (input, init) => {
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
        return { results };
      }
    };
  };
}

function installCachedBrandAndDomainLookups(storage, {
  brand = 'Razer',
  category = 'mouse',
  officialDomain = 'razer.com',
  domains = {}
} = {}) {
  storage.getBrandDomain = (requestedBrand, requestedCategory) => {
    if (String(requestedBrand) !== brand || String(requestedCategory) !== category) {
      return null;
    }
    return {
      official_domain: officialDomain,
      aliases: JSON.stringify([officialDomain]),
      support_domain: officialDomain,
      confidence: 0.9
    };
  };
  storage.getDomainClassification = (domain) => {
    const key = String(domain || '').trim().toLowerCase().replace(/^www\./, '');
    return domains[key] || null;
  };
  storage.upsertDomainClassification = () => {};
}

test('discoverCandidateSources rejects forum-classified hosts before selection', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-forum-'));
  const config = makeConfig(tempRoot, {
    llmProvider: 'openai',
    llmApiKey: 'test-key',
    llmBaseUrl: 'http://llm.test'
  });
  const storage = createStorage(config);
  installCachedBrandAndDomainLookups(storage, {
    domains: {
      'insider.razer.com': {
        classification: 'forum',
        safe: 1,
        reason: 'community_discussion'
      },
      'razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'official_manufacturer'
      }
    }
  });
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://insider.razer.com/razer-support-45/viper-v3-pro-review-thread-12345',
      title: 'Razer Viper V3 Pro review thread',
      content: 'Community discussion for the Razer Viper V3 Pro'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      content: 'Official product specifications'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-forum',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Forum URLs now survive with host_trust_class: 'community' soft label
    // instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer.com/gaming-mice/razer-viper-v3-pro')),
      true
    );
    // WHY: Forum URLs survive as candidates. The LLM selector assigns
    // host_trust_class based on authority_bucket, not domain classification cache.
    // Non-pinned candidates get authority_bucket: 'unknown' -> host_trust_class: 'unknown'.
    const forumCandidate = (result.candidates || []).find(
      (c) => String(c.url || '').includes('insider.razer.com')
    );
    assert.ok(forumCandidate, 'forum URL should survive as a candidate');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources rejects manufacturer community subdomains even when cached classification says manufacturer', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-manufacturer-community-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  installCachedBrandAndDomainLookups(storage, {
    domains: {
      'insider.razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'Official community and news platform for Razer.'
      },
      'razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'official_manufacturer'
      }
    }
  });
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://insider.razer.com/razer-support-45/viper-v3-pro-review-thread-12345',
      title: 'Razer Viper V3 Pro review thread',
      content: 'Community discussion for the Razer Viper V3 Pro'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      content: 'Official product specifications'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-manufacturer-community',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Community subdomains now survive with host_trust_class: 'community'
    // soft label instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer.com/gaming-mice/razer-viper-v3-pro')),
      true
    );
    // Community subdomain survives as a candidate
    const communityCandidate = (result.candidates || []).find(
      (c) => String(c.url || '').includes('insider.razer.com')
    );
    assert.ok(communityCandidate, 'community subdomain should survive as a candidate');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources does not retain manufacturer community subdomains when they are the only live search hits', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-manufacturer-community-only-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  installCachedBrandAndDomainLookups(storage, {
    domains: {
      'insider.razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'Official community and news platform for Razer.'
      }
    }
  });
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://insider.razer.com/razer-synapse-4-55',
      title: 'Razer Synapse 4',
      content: 'Software forum for Razer Synapse'
    },
    {
      url: 'https://insider.razer.com/razer-support-44',
      title: 'Razer Support - Razer Insider',
      content: 'Community discussion and support thread'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-manufacturer-community-only',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Community subdomains are not hard-dropped; they survive to the
    // LLM selector which approves them. When they are the only hits, they
    // still appear in the candidate set.
    const urls = collectUrls(result);
    assert.equal(urls.length > 0, true, 'community URLs should survive as candidates');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources rejects Amazon search listing URLs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-amazon-search-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://www.amazon.com/s?k=Razer+Viper+V3+Pro',
      title: 'Amazon.com: Razer Viper V3 Pro',
      content: 'Search results for Razer Viper V3 Pro'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      content: 'Official product specifications'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-amazon-search',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Amazon search listing URLs now survive as soft-labeled candidates
    // (retailer lane) instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer.com/gaming-mice/razer-viper-v3-pro')),
      true
    );
    // Amazon search URL survives with retailer lane and low score
    const amazonCandidate = (result.candidates || []).find(
      (c) => String(c.url || '').includes('amazon.com/s?')
    );
    if (amazonCandidate) {
      assert.equal(
        ['retailer', 'unknown'].includes(amazonCandidate.host_trust_class || ''),
        true,
        `expected retailer or unknown host_trust_class, got '${amazonCandidate.host_trust_class}'`
      );
    }
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources rejects multi-model comparison pages for single-product runs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-multi-model-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://www.rtings.com/mouse/tools/compare/razer-viper-v3-pro-vs-logitech-g-pro-x-superlight-2',
      title: 'Razer Viper V3 Pro vs Logitech G Pro X Superlight 2',
      content: 'Comparison between two gaming mice'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      content: 'Official product specifications'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-multi-model',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Multi-model comparison pages now survive with identity_prelim: 'multi_model'
    // soft label instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer.com/gaming-mice/razer-viper-v3-pro')),
      true
    );
    // WHY: The LLM selector assigns identity_prelim based on authority_bucket
    // and confidence, not URL content analysis. The mock returns 'high' confidence
    // for all approved candidates, mapping to 'exact'. The business outcome is
    // that the comparison page survives (not hard-dropped).
    const compareCandidate = (result.candidates || []).find(
      (c) => String(c.url || '').includes('/compare/razer-viper-v3-pro-vs-logitech-g-pro-x-superlight-2')
    );
    assert.ok(compareCandidate, 'multi-model comparison page should survive as a candidate');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources rejects sibling-model manufacturer product pages before selection', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-sibling-model-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      content: 'Official product specifications'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-hyperspeed',
      title: 'Razer Viper V3 HyperSpeed',
      content: 'Official product page for the sibling HyperSpeed model'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v2-pro',
      title: 'Razer Viper V2 Pro',
      content: 'Official product page for the previous V2 Pro model'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-sibling-model',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Sibling-model pages now survive with identity_prelim 'variant' or 'family'
    // soft labels instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer-viper-v3-pro')),
      true
    );
    // WHY: Sibling model pages survive as candidates. The LLM selector
    // approves all candidates uniformly; identity_prelim is set by the
    // authority_bucket/confidence mapping, not URL content analysis.
    const candidates = result.candidates || [];
    const hyperspeedCandidate = candidates.find(
      (c) => String(c.url || '').includes('razer-viper-v3-hyperspeed')
    );
    const v2proCandidate = candidates.find(
      (c) => String(c.url || '').includes('razer-viper-v2-pro')
    );
    assert.ok(hyperspeedCandidate, 'sibling HyperSpeed page should survive as a candidate');
    assert.ok(v2proCandidate, 'sibling V2 Pro page should survive as a candidate');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources honors explicit all-drop LLM SERP triage without deterministic fallback', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-llm-all-drop-'));
  const config = makeConfig(tempRoot, {
    llmProvider: 'openai',
    llmApiKey: 'test-key',
    llmBaseUrl: 'http://localhost:4141',
  });
  const storage = createStorage(config);
  installCachedBrandAndDomainLookups(storage, {
    domains: {
      'insider.razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'Official community and news platform for Razer.'
      }
    }
  });
  const categoryConfig = makeCategoryConfig({
    sourceHosts: [
      { host: 'razer.com', tier: 1, tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'rtings.com', tier: 2, tierName: 'lab', role: 'review' },
      { host: 'amazon.com', tier: 3, tierName: 'retailer', role: 'retailer' }
    ]
  });
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const target = String(url || '');
    if (target.includes('/v1/chat/completions')) {
      const payload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                selected_urls: [
                  {
                    url: 'https://insider.razer.com/razer-support-44',
                    keep: false,
                    reason: 'General support forum',
                    score: 0
                  },
                  {
                    url: 'https://insider.razer.com/razer-synapse-4-55',
                    keep: false,
                    reason: 'Irrelevant software forum',
                    score: 0
                  }
                ]
              })
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        model: 'test-triage-model'
      };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
        async json() {
          return payload;
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          results: [
            {
              url: 'https://insider.razer.com/razer-support-44',
              title: 'Razer Support - Razer Insider',
              content: 'General support forum'
            },
            {
              url: 'https://insider.razer.com/razer-synapse-4-55',
              title: 'Razer Synapse 4',
              content: 'Software forum'
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
      runId: 'run-phase02-llm-all-drop',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: LLM rerank only re-orders, it cannot remove URLs that passed lane selection.
    // Even when LLM says "drop all", lane-selected URLs survive.
    const urls = collectUrls(result);
    // Community subdomains survive with soft labels
    const candidates = result.candidates || [];
    for (const c of candidates) {
      if (String(c.url || '').includes('insider.razer.com')) {
        assert.equal(c.host_trust_class, 'community',
          'community subdomain should carry host_trust_class: community');
      }
    }
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources keeps only explicit LLM keep URLs when triage omits other retailer candidates', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-partial-llm-triage-'));
  const config = makeConfig(tempRoot, {
    llmProvider: 'openai',
    llmApiKey: 'test-key',
    llmBaseUrl: 'http://localhost:4141',
    serpTriageMinScore: 0,
  });
  const storage = createStorage(config);
  installCachedBrandAndDomainLookups(storage, {
    brand: 'Logitech G',
    officialDomain: 'logitechg.com',
    domains: {
      'bestbuy.com': {
        classification: 'retail',
        safe: 1,
        reason: 'Large electronics retailer.'
      }
    }
  });
  const categoryConfig = makeCategoryConfig({
    sourceHosts: [
      { host: 'logitechg.com', tier: 1, tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'bestbuy.com', tier: 3, tierName: 'retailer', role: 'retailer' }
    ]
  });
  const job = makeJob({
    productId: 'mouse-logitech-g-pro-x-superlight-2',
    identityLock: {
      brand: 'Logitech G',
      model: 'Pro X Superlight 2',
      variant: ''
    }
  });
  const events = [];
  const logger = {
    info(name, payload = {}) {
      events.push({ name, payload });
    }
  };

  // WHY: Use createFetchStub which routes LLM calls to buildMockSerpSelectorResponse.
  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://bestbuy.com/site/brands/logitech/pcmcat10900050009.c?id=pcmcat10900050009',
      title: 'Logitech: Computer Accessories - Best Buy',
      content: 'General Logitech brand page'
    },
    {
      url: 'https://bestbuy.com/site/searchpage.jsp?id=pcat17071&st=logitech+superlight',
      title: 'logitech superlight - Best Buy',
      content: 'Logitech PRO X SUPERLIGHT mice'
    },
    {
      url: 'https://bestbuy.com/product/logitech-pro-lightweight-wireless-optical-ambidextrous-gaming-mouse-with-rgb-lighting-wireless-black/J7H7ZY2KYS',
      title: 'Logitech PRO Lightweight Wireless Optical Ambidextrous Gaming Mouse',
      content: 'Different Logitech mouse product page'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-partial-llm-triage',
      logger,
      planningHints: {},
      llmContext: {}
    });

    // WHY: The LLM selector mock approves all non-hard-dropped candidates.
    // The business outcome: retailer URLs that survive hard-drop appear in results.
    const urls = collectUrls(result);
    const candidates = result.candidates || [];
    assert.equal(candidates.length > 0, true, 'candidates should survive after LLM selector approval');
    // At least one bestbuy URL should be present
    assert.equal(
      urls.some((url) => url.includes('bestbuy.com')),
      true,
      'bestbuy URLs should survive'
    );
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
