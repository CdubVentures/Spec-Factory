import path from 'node:path';
import { createStorage } from '../../../../../s3/storage.js';
import { discoverCandidateSources } from '../../searchDiscovery.js';
import { buildMockSerpSelectorResponse, isLlmEndpoint } from './discoverySelectorHarness.js';

export {
  createStorage,
  discoverCandidateSources,
  buildMockSerpSelectorResponse,
  isLlmEndpoint,
};

export function makeConfig(tempRoot, overrides = {}) {
  return {
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs',
    discoveryEnabled: true,
    searchProfileQueryCap: 1,
    searchEngines: 'bing,brave,duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080',
    searxngMinQueryIntervalMs: 0,
    // WHY: LLM API key required so the SERP selector call reaches fetch
    // instead of throwing 'LLM_API_KEY is not configured'.
    llmApiKey: 'test-key',
    ...overrides,
  };
}

export function makeCategoryConfig(overrides = {}) {
  return {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', tier: 1, tierName: 'manufacturer', role: 'manufacturer' },
      { host: 'rtings.com', tier: 2, tierName: 'lab', role: 'review' },
      { host: 'amazon.com', tier: 3, tierName: 'retailer', role: 'retailer' },
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs'],
    fieldOrder: [],
    ...overrides,
  };
}

export function makeJob(overrides = {}) {
  return {
    productId: 'mouse-razer-viper-v3-pro',
    category: 'mouse',
    identityLock: {
      brand: 'Razer',
      model: 'Viper V3 Pro',
      variant: '',
    },
    ...overrides,
  };
}

export function collectUrls(result = {}) {
  return [...new Set([...(result.selectedUrls || []), ...(result.allCandidateUrls || [])])];
}

export function createFetchStub(results = []) {
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
      },
    };
  };
}

export function installCachedBrandAndDomainLookups(storage, {
  brand = 'Razer',
  category = 'mouse',
  officialDomain = 'razer.com',
  domains = {},
} = {}) {
  storage.getBrandDomain = (requestedBrand, requestedCategory) => {
    if (String(requestedBrand) !== brand || String(requestedCategory) !== category) {
      return null;
    }
    return {
      official_domain: officialDomain,
      aliases: JSON.stringify([officialDomain]),
      support_domain: officialDomain,
      confidence: 0.9,
    };
  };
  storage.getDomainClassification = (domain) => {
    const key = String(domain || '').trim().toLowerCase().replace(/^www\./, '');
    return domains[key] || null;
  };
  storage.upsertDomainClassification = () => {};
}
