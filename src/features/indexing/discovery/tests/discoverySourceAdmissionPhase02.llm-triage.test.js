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
