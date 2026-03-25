import test from 'node:test';
import assert from 'node:assert/strict';
import { runSearchProviders, searchEngineAvailability } from '../searchProviders.js';
import { makeSearchConfig, makeSearchResponse, makeSearchResult } from './helpers/searchProviderHarness.js';

function makeBraveResult(overrides = {}) {
  return {
    url: 'https://example.com/brave-result',
    title: 'Brave Result',
    snippet: 'via brave',
    provider: 'brave-api',
    query: 'test query',
    ...overrides,
  };
}

test('brave-only dispatch returns results when API key is set', async () => {
  const { results, usedFallback } = await runSearchProviders({
    config: makeSearchConfig({ searchEngines: 'brave', braveApiKey: 'test-key', searxngBaseUrl: '' }),
    query: 'logitech g pro x superlight 2',
    limit: 5,
    _searchBraveFn: async ({ query }) => [makeBraveResult({ query })],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].provider, 'brave-api');
  assert.equal(usedFallback, false);
});

test('mixed dispatch: google + brave both fire and merge', async () => {
  const { results } = await runSearchProviders({
    config: makeSearchConfig({ searchEngines: 'google,brave', braveApiKey: 'test-key', searxngBaseUrl: '' }),
    query: 'razer viper v3',
    limit: 5,
    _searchGoogleFn: async ({ query }) => ({
      results: [{ url: 'https://example.com/google', title: 'Google', snippet: 'g', provider: 'google', query }],
    }),
    _searchBraveFn: async ({ query }) => [makeBraveResult({ url: 'https://example.com/brave', query })],
  });
  assert.equal(results.length, 2);
  const providers = results.map(r => r.provider).sort();
  assert.deepEqual(providers, ['brave-api', 'google']);
});

test('brave skipped when no API key — zero results, no crash', async () => {
  const { results } = await runSearchProviders({
    config: makeSearchConfig({ searchEngines: 'brave', braveApiKey: '', searxngBaseUrl: '' }),
    query: 'test',
    limit: 5,
    _searchBraveFn: async () => { throw new Error('should not be called'); },
  });
  assert.equal(results.length, 0);
});

test('brave availability reports internet_ready when key is set', () => {
  const available = searchEngineAvailability({
    searchEngines: 'brave',
    braveApiKey: 'test-key',
  });
  assert.equal(available.brave_api_ready, true);
  assert.equal(available.internet_ready, true);
  assert.deepEqual(available.active_providers, ['brave']);
});

test('brave fallback: primary brave returns empty, fallback bing fires via SearXNG', async () => {
  let searxngCalled = false;
  const original = global.fetch;
  global.fetch = async () => {
    searxngCalled = true;
    return makeSearchResponse([
      makeSearchResult({ url: 'https://example.com/bing-fallback', engine: 'bing' }),
    ]);
  };
  try {
    const { results, usedFallback } = await runSearchProviders({
      config: makeSearchConfig({
        searchEngines: 'brave',
        braveApiKey: 'test-key',
        searchEnginesFallback: 'bing',
        searxngBaseUrl: 'http://127.0.0.1:8080',
      }),
      query: 'test fallback',
      limit: 5,
      _searchBraveFn: async () => [],
    });
    assert.equal(usedFallback, true);
    assert.ok(results.length > 0, 'fallback should produce results');
    assert.equal(searxngCalled, true, 'SearXNG should have been called for bing fallback');
  } finally {
    global.fetch = original;
  }
});
