import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../../../s3/storage.js';
import { discoverCandidateSources } from '../searchDiscovery.js';
import { buildMockSerpSelectorResponse, isLlmEndpoint } from '../../../../../test/helpers/discoverySelectorHarness.js';

test('discoverCandidateSources filters unrelated manufacturer domains for locked brand', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-discovery-brand-'));
  const localInputRoot = path.join(tempRoot, 'fixtures');
  const localOutputRoot = path.join(tempRoot, 'out');
  const config = {
    localMode: true,
    localInputRoot,
    localOutputRoot,
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs',
    discoveryEnabled: true,
    searchProfileQueryCap: 3,
    searchEngines: 'bing,brave,duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080',
    searxngMinQueryIntervalMs: 0,
    // WHY: LLM API key required so the SERP selector call reaches fetch
    // instead of throwing 'LLM_API_KEY is not configured' before the mock can respond.
    llmApiKey: 'test-key',
  };
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', tier: 1, tierName: 'manufacturer' },
      { host: 'logitechg.com', tier: 1, tierName: 'manufacturer' },
      { host: 'rtings.com', tier: 2, tierName: 'lab' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs']
  };
  const job = {
    productId: 'mouse-logitech-g-pro-x-superlight-2',
    category: 'mouse',
    identityLock: {
      brand: 'Logitech',
      model: 'G Pro X Superlight 2',
      variant: ''
    }
  };

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
              url: 'https://www.logitechg.com/en-us/products/gaming-mice/pro-x2-superlight-wireless-mouse.html',
              title: 'Logitech G Pro X Superlight 2',
              content: 'Official product page with specs'
            },
            {
              url: 'https://www.razer.com/gaming-mice/razer-deathadder-v3',
              title: 'Razer DeathAdder V3',
              content: 'Razer gaming mouse page'
            },
            {
              url: 'https://www.rtings.com/mouse/reviews/logitech/g-pro-x-superlight-2',
              title: 'Logitech G Pro X Superlight 2 Review',
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
      runId: 'test-run',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Brand-mismatched manufacturer URLs survive as candidates instead of
    // being hard-dropped. The LLM SERP selector sets identity_prelim from its
    // own confidence assessment — brand mismatch is not a hard-drop gate.
    const urls = [...new Set([...(result.selectedUrls || []), ...(result.allCandidateUrls || [])])];
    assert.equal(urls.some((url) => url.includes('logitechg.com')), true);

    // razer.com URLs survive (not hard-dropped) — brand mismatch is soft
    const allCandidateUrls = (result.candidates || []).map((c) => String(c.url || ''));
    assert.equal(
      allCandidateUrls.some((url) => url.includes('razer.com')),
      true,
      'expected razer.com URLs to survive as candidates (not hard-dropped)'
    );
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
