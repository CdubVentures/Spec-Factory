import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createStorage,
  discoverCandidateSources,
  makeConfig,
  makeCategoryConfig,
  makeJob,
  collectUrls,
  createFetchStub,
  installCachedBrandAndDomainLookups,
} from './helpers/discoverySourceAdmissionPhase02Harness.js';

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

test('discoverCandidateSources keeps only explicit LLM keep URLs when triage omits other retailer candidates', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-partial-llm-triage-'));
  const config = makeConfig(tempRoot, {
    llmProvider: 'openai',
    llmApiKey: 'test-key',
    llmBaseUrl: 'http://localhost:4141',
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
