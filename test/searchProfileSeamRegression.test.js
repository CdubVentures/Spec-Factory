// WHY: Regression guard for the searchProfileFinal shape. Asserts no data is
// lost during the searchDiscovery extraction seam. Tests that brand_resolution
// and other profile fields are threaded through correctly.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../src/s3/storage.js';
import { discoverCandidateSources } from '../src/features/indexing/discovery/searchDiscovery.js';
import { loadSourceRegistry } from '../src/features/indexing/pipeline/shared/sourceRegistry.js';

const TEST_HOSTS = {
  manufacturer: 'acme.test',
  retailer: 'shop.test',
  lab: 'lab.test',
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
    ...overrides,
  };
}

function makeCategoryConfig() {
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
          search_hints: { query_terms: ['sensor'], domain_hints: ['retailer', TEST_HOSTS.lab], preferred_content_types: ['manual_pdf'] },
        },
        weight: {
          search_hints: { query_terms: ['weight'], domain_hints: ['retailer'] },
        },
      },
    },
    sources,
    validatedRegistry: registry,
    registryPopulationGate: { passed: true, reasons: [] },
  };
}

// --- Expected top-level keys on searchProfileFinal ---
const EXPECTED_PROFILE_KEYS = [
  'category', 'product_id', 'run_id', 'base_model', 'aliases',
  'status', 'provider',
  'selected_queries', 'query_rows', 'query_guard', 'query_reject_log',
  'brand_resolution',
  'key', 'run_key', 'latest_key',
  'query_stats', 'discovered_count', 'approved_count', 'candidate_count',
  'llm_query_planning', 'llm_serp_selector', 'serp_explorer',
];

describe('searchProfileFinal shape regression', () => {
  it('old path: all expected top-level keys present', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-seam-'));
    const config = makeConfig(tempRoot);
    const storage = createStorage(config);
    storage.getBrandDomain = (brand) => {
      if (brand === 'Acme') {
        return {
          official_domain: TEST_HOSTS.manufacturer,
          aliases: '[]',
          support_domain: `support.${TEST_HOSTS.manufacturer}`,
          confidence: 0.9,
        };
      }
      return null;
    };
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, async json() { return { results: [] }; } });
    try {
      const result = await discoverCandidateSources({
        config,
        storage,
        categoryConfig: makeCategoryConfig(),
        job: { productId: 'mouse-acme-orbit-x1', category: 'mouse',
          identityLock: { brand: 'Acme', model: 'Orbit X1', variant: '' } },
        runId: 'run-seam-shape',
        logger: null,
        planningHints: { missingRequiredFields: ['sensor', 'weight'] },
        llmContext: {},
      });

      const sp = result.search_profile;
      assert.ok(sp, 'search_profile must exist on result');
      for (const key of EXPECTED_PROFILE_KEYS) {
        assert.ok(key in sp, `missing expected key: ${key}`);
      }
    } finally {
      global.fetch = originalFetch;
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('old path: brand_resolution carry-through', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-seam-brand-'));
    const config = makeConfig(tempRoot);
    const storage = createStorage(config);
    storage.getBrandDomain = (brand) => {
      if (brand === 'Acme') {
        return {
          official_domain: 'acme.test',
          aliases: '["acme-alt.test"]',
          support_domain: 'support.acme.test',
          confidence: 0.95,
        };
      }
      return null;
    };
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, async json() { return { results: [] }; } });
    try {
      const result = await discoverCandidateSources({
        config,
        storage,
        categoryConfig: makeCategoryConfig(),
        job: { productId: 'mouse-acme-orbit-x1', category: 'mouse',
          identityLock: { brand: 'Acme', model: 'Orbit X1', variant: '' } },
        runId: 'run-seam-brand',
        logger: null,
        planningHints: { missingRequiredFields: ['sensor'] },
        llmContext: {},
      });

      const br = result.search_profile?.brand_resolution;
      assert.ok(br, 'brand_resolution must be present');
      assert.equal(br.officialDomain, 'acme.test');
      assert.equal(br.supportDomain, 'support.acme.test');
      assert.ok(Array.isArray(br.aliases));
      assert.equal(typeof br.confidence, 'number');
      assert.ok(Array.isArray(br.reasoning));
    } finally {
      global.fetch = originalFetch;
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('old path: query count stability', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-seam-count-'));
    const config = makeConfig(tempRoot);
    const storage = createStorage(config);
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, async json() { return { results: [] }; } });
    try {
      const result = await discoverCandidateSources({
        config,
        storage,
        categoryConfig: makeCategoryConfig(),
        job: { productId: 'mouse-acme-orbit-x1', category: 'mouse',
          identityLock: { brand: 'Acme', model: 'Orbit X1', variant: '' } },
        runId: 'run-seam-count',
        logger: null,
        planningHints: { missingRequiredFields: ['sensor', 'weight'] },
        llmContext: {},
      });

      const sp = result.search_profile;
      if (sp.selected_query_count != null && sp.selected_queries) {
        assert.equal(sp.selected_query_count, sp.selected_queries.length,
          'selected_query_count must equal selected_queries.length');
      }
    } finally {
      global.fetch = originalFetch;
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('artifact keys are non-empty strings', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-seam-keys-'));
    const config = makeConfig(tempRoot);
    const storage = createStorage(config);
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, async json() { return { results: [] }; } });
    try {
      const result = await discoverCandidateSources({
        config,
        storage,
        categoryConfig: makeCategoryConfig(),
        job: { productId: 'mouse-acme-orbit-x1', category: 'mouse',
          identityLock: { brand: 'Acme', model: 'Orbit X1', variant: '' } },
        runId: 'run-seam-keys',
        logger: null,
        planningHints: { missingRequiredFields: ['sensor'] },
        llmContext: {},
      });

      const sp = result.search_profile;
      assert.ok(typeof sp.key === 'string' && sp.key.length > 0, 'key must be non-empty');
      assert.ok(typeof sp.run_key === 'string' && sp.run_key.length > 0, 'run_key must be non-empty');
      assert.ok(typeof sp.latest_key === 'string' && sp.latest_key.length > 0, 'latest_key must be non-empty');
    } finally {
      global.fetch = originalFetch;
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

});
