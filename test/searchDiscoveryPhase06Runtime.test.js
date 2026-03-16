import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../src/s3/storage.js';
import { discoverCandidateSources } from '../src/features/indexing/discovery/searchDiscovery.js';
import { loadSourceRegistry } from '../src/features/indexing/discovery/sourceRegistry.js';

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
    discoveryMaxQueries: 4,
    discoveryResultsPerQuery: 5,
    discoveryMaxDiscovered: 20,
    discoveryQueryConcurrency: 1,
    searchProvider: 'searxng',
    searxngBaseUrl: 'http://127.0.0.1:8080',
    searxngMinQueryIntervalMs: 0,
    llmEnabled: false,
    llmPlanDiscoveryQueries: false,
    enableSourceRegistry: true,
    enableDomainHintResolverV2: true,
    enableQueryCompiler: true,
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

test('discoverCandidateSources attaches effective_host_plan and scored host-plan rows when v2 discovery flags are enabled', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();
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
      runId: 'run-phase06-v2-on',
      logger: null,
      planningHints: {
        missingRequiredFields: ['sensor', 'weight'],
      },
      llmContext: {},
    });

    const plan = result.search_profile?.effective_host_plan;
    assert.ok(plan, 'expected effective_host_plan on the runtime search profile');
    assert.equal(plan.host_groups.some((group) => group.host === TEST_HOSTS.retailer), true);
    assert.equal(plan.host_groups.some((group) => group.host === TEST_HOSTS.lab), true);
    assert.equal(plan.unresolved_tokens.includes('mystery-token'), true);

    const v2Rows = (result.search_profile?.query_rows || []).filter((row) => row.hint_source === 'v2.host_plan');
    assert.ok(v2Rows.length > 0, 'expected compiled host-plan query rows');
    assert.ok(v2Rows.every((row) => typeof row.score_breakdown?.needset_coverage_bonus === 'number'));
    assert.ok(v2Rows.every((row) => typeof row.score_breakdown?.field_affinity_bonus === 'number'));
    assert.ok(v2Rows.some((row) => String(row.query || '').includes('site:')));
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources leaves the legacy planner path unchanged when v2 discovery flags are disabled', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-legacy-'));
  const config = makeConfig(tempRoot, {
    enableSourceRegistry: false,
    enableDomainHintResolverV2: false,
    enableQueryCompiler: false,
  });
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();
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
      runId: 'run-phase06-v2-off',
      logger: null,
      planningHints: {
        missingRequiredFields: ['sensor', 'weight'],
      },
      llmContext: {},
    });

    assert.equal(result.search_profile?.effective_host_plan ?? null, null);
    assert.equal(
      (result.search_profile?.query_rows || []).some((row) => row.hint_source === 'v2.host_plan'),
      false
    );
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources rescues zero-result internet queries with deterministic host-plan fallbacks', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-plan-fallback-'));
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
      runId: 'run-phase06-plan-fallback',
      logger,
      planningHints: {
        missingRequiredFields: ['sensor', 'weight'],
      },
      llmContext: {},
    });

    assert.equal(
      (result.search_attempts || []).some(
        (row) => row.reason_code === 'internet_search_zero_plan_fallback' && row.result_count > 0
      ),
      true,
    );
    assert.equal(
      (result.search_profile?.query_rows || []).some((row) => Number(row?.result_count || 0) > 0),
      true,
    );
    assert.equal(
      (result.search_profile?.query_rows || []).some(
        (row) => row.hint_source === 'v2.host_plan' && Number(row?.result_count || 0) > 0
      ),
      true,
    );
    assert.equal(
      (result.approvedUrls || []).some(
        (url) => String(url).startsWith(`https://${TEST_HOSTS.manufacturer}/`) || String(url).startsWith(TEST_URLS.product)
      ),
      true,
    );
    const domainEvent = events.find((event) => event.name === 'domains_classified');
    assert.ok(domainEvent, 'expected domains_classified event');
    const classifications = Array.isArray(domainEvent?.payload?.classifications)
      ? domainEvent.payload.classifications
      : [];
    assert.equal(
      classifications.some((row) => String(row?.domain || '').trim() === TEST_HOSTS.manufacturer),
      true,
      'expected deterministic classification for rescued manufacturer domain',
    );
    assert.equal(
      classifications.every((row) => String(row?.notes || '').trim() === 'deterministic_heuristic'),
      true,
      'expected deterministic heuristic notes when llmEnabled=false',
    );
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources skips conditional triage at the 60 percent deterministic-quality boundary', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-triage-skip-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 1,
    llmEnabled: true,
    llmSerpRerankEnabled: true,
    serpTriageEnabled: true,
    serpTriageMinScore: 0,
    serpTriageMaxUrls: 5,
  });
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();
  const events = [];
  const logger = makeLogger(events);
  const originalFetch = global.fetch;
  global.fetch = async () => ({
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
  });

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

    const skippedEvent = events.find((event) => event.name === 'llm_triage_skipped');
    assert.ok(skippedEvent, 'expected llm_triage_skipped event');
    assert.equal(skippedEvent?.payload?.reason, 'sufficient_deterministic_quality');
    assert.equal(skippedEvent?.payload?.high_quality_count, 3);
    assert.equal(skippedEvent?.payload?.threshold, 3);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources enters triage flow when deterministic quality stays below threshold', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-triage-needed-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 1,
    llmEnabled: true,
    llmSerpRerankEnabled: true,
    serpTriageEnabled: true,
    serpTriageMinScore: 0,
    serpTriageMaxUrls: 10,
  });
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();
  const events = [];
  const logger = makeLogger(events);
  const originalFetch = global.fetch;
  global.fetch = async () => ({
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
  });

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

    assert.equal(
      events.some((event) => event.name === 'llm_triage_skipped'),
      false,
      'expected conditional triage path instead of skip path',
    );
    const triageEvent = events.find((event) => event.name === 'serp_triage_completed');
    assert.ok(triageEvent, 'expected serp_triage_completed event');
    assert.ok((triageEvent?.payload?.candidates || []).length > 0, 'expected triage candidates');
    assert.equal(
      (triageEvent?.payload?.candidates || []).some((candidate) => candidate.rationale === 'deterministic'),
      true,
      'expected deterministic reranker fallback when no live route key is present in test',
    );
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources falls back to top-level job identity for query guard and live candidate scoring', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-top-level-identity-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 1,
    discoveryResultsPerQuery: 5,
    discoveryMaxDiscovered: 5,
    serpTriageEnabled: true,
    serpTriageMinScore: 0,
    serpTriageMaxUrls: 5,
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
  global.fetch = async () => ({
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
  });

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

    const exactManual = (result.candidates || []).find((row) =>
      String(row?.url || '').includes('/manuals/orbit-x1')
    );
    assert.ok(exactManual, 'expected exact manual candidate to survive triage');
    assert.equal(exactManual.identity_match_level, 'partial');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources reuses cached frontier query results during same-product cooldown', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-query-cache-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 1,
    searchTemplates: undefined,
  });
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig({
    searchTemplates: ['{brand} {model} specifications'],
  });
  const job = makeJob();
  const frontierDb = {
    shouldSkipQuery() {
      return true;
    },
    getQueryRecord() {
      return {
        query_text: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} specifications`,
        provider: 'google',
        results: [
          {
            url: TEST_URLS.product,
            title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model}`,
            snippet: 'Official product specifications',
            provider: 'google',
          }
        ]
      };
    },
    canonicalize(url) {
      return { canonical_url: String(url || '').trim() };
    },
    shouldSkipUrl() {
      return { skip: false, reason: null };
    },
    snapshotForProduct() {
      return {};
    }
  };
  const events = [];
  const logger = makeLogger(events);
  let fetchCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      async json() {
        return { results: [] };
      },
    };
  };

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase06-query-cache',
      logger,
      planningHints: {
        missingRequiredFields: ['sensor'],
      },
      llmContext: {},
      frontierDb,
    });

    assert.deepEqual(
      result.approvedUrls,
      [TEST_URLS.product]
    );
    assert.equal(fetchCalls, 0, 'internet search should not run when cached frontier results are reused');
    const startedEvents = events.filter((event) => event.name === 'discovery_query_started');
    const completedEvents = events.filter((event) => event.name === 'discovery_query_completed');
    const cachedQuery = `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} specifications`;
    const startedMatch = startedEvents.find((event) => event.payload?.query === cachedQuery);
    const completedMatch = completedEvents.find((event) => event.payload?.query === cachedQuery);
    assert.ok(startedMatch, 'cached query reuse should still emit discovery_query_started for the reused query');
    assert.ok(completedMatch, 'cached query reuse should still emit discovery_query_completed for the reused query');
    assert.equal(completedMatch?.payload?.provider, 'google');
    assert.equal(completedMatch?.payload?.result_count, 1);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources ignores cooldown-only empty cache and still executes internet search', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase06-runtime-empty-query-cache-'));
  const config = makeConfig(tempRoot, {
    discoveryMaxQueries: 1,
    searchTemplates: undefined,
  });
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig({
    searchTemplates: ['{brand} {model} specifications'],
  });
  const job = makeJob();
  const frontierDb = {
    shouldSkipQuery() {
      return true;
    },
    getQueryRecord() {
      return {
        query_text: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model} specifications`,
        provider: 'google',
        results: []
      };
    },
    recordQuery() {
      return { query_hash: 'cache-miss' };
    },
    canonicalize(url) {
      return { canonical_url: String(url || '').trim() };
    },
    shouldSkipUrl() {
      return { skip: false, reason: null };
    },
    snapshotForProduct() {
      return {};
    }
  };
  let fetchCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      async json() {
        return {
          results: [
            {
              url: TEST_URLS.product,
              title: `${TEST_IDENTITY.brand} ${TEST_IDENTITY.model}`,
              content: 'Official product specifications'
            }
          ]
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
      runId: 'run-phase06-empty-query-cache',
      logger: null,
      planningHints: {
        missingRequiredFields: ['sensor'],
      },
      llmContext: {},
      frontierDb,
    });

    assert.equal(fetchCalls > 0, true, 'internet search should still run when cooldown cache is empty');
    assert.deepEqual(
      result.approvedUrls,
      [TEST_URLS.product]
    );
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
