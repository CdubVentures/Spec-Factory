import test from 'node:test';
import assert from 'node:assert/strict';
import { runSearchProviders } from '../searchProviders.js';
import {
  makeSearchConfig,
  makeSearchResponse,
  makeSearchResult,
} from './helpers/searchProviderHarness.js';

function makeGoogleResult(overrides = {}) {
  return {
    url: 'https://example.com/google-result',
    title: 'Google Result',
    snippet: 'via google',
    provider: 'google',
    query: 'test query',
    ...overrides,
  };
}

function makeProviderRow(overrides = {}) {
  return makeSearchResult({
    provider: undefined,
    snippet: undefined,
    ...overrides,
  });
}

async function withMockFetch(handler, run) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
  }
}

test('runSearchProviders returns merged google and bing results for legacy dual mode', async () => {
  await withMockFetch(
    async () => makeSearchResponse([
      makeProviderRow({
        url: 'https://example.com/spec',
        title: 'Spec',
        content: 'details',
        engine: 'bing',
        engines: ['bing'],
      }),
    ]),
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({
          searchProvider: 'dual',
        }),
        query: 'logitech g pro x superlight 2',
        limit: 5,
        _searchGoogleFn: async ({ query }) => ({
          results: [makeGoogleResult({ url: 'https://example.com/google-dual', title: 'Google Dual', query })],
        }),
      });

      assert.equal(usedFallback, false);
      assert.deepEqual(
        rows.map(({ url, provider }) => ({ url, provider })).sort((left, right) => left.provider.localeCompare(right.provider)),
        [
          { url: 'https://example.com/spec', provider: 'bing' },
          { url: 'https://example.com/google-dual', provider: 'google' },
        ],
      );
    },
  );
});

test('runSearchProviders returns google provider rows when only google is configured', async () => {
  await withMockFetch(
    async () => makeSearchResponse([]),
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'google' }),
        query: 'logitech mx master 3s',
        limit: 5,
        _searchGoogleFn: async ({ query }) => ({
          results: [makeGoogleResult({ query })],
        }),
      });

      assert.equal(usedFallback, false);
      assert.deepEqual(
        rows.map(({ provider, url }) => ({ provider, url })),
        [{ provider: 'google', url: 'https://example.com/google-result' }],
      );
    },
  );
});

test('runSearchProviders merges google and searxng provider rows when both return results', async () => {
  await withMockFetch(
    async () => makeSearchResponse([
      makeProviderRow({
        url: 'https://example.com/bing-result',
        title: 'Bing Result',
        content: 'from bing',
        engine: 'bing',
        engines: ['bing'],
      }),
    ]),
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'google,bing' }),
        query: 'test dual',
        limit: 5,
        _searchGoogleFn: async ({ query }) => ({
          results: [makeGoogleResult({ query })],
        }),
      });

      assert.equal(usedFallback, false);
      assert.deepEqual(
        rows.map(({ provider, url }) => ({ provider, url })).sort((left, right) => left.provider.localeCompare(right.provider)),
        [
          { provider: 'bing', url: 'https://example.com/bing-result' },
          { provider: 'google', url: 'https://example.com/google-result' },
        ],
      );
    },
  );
});

test('runSearchProviders returns google fallback results when the primary engines produce no usable rows', async () => {
  await withMockFetch(
    async () => makeSearchResponse([]),
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'google' }),
        query: 'test fallback google',
        limit: 5,
        _searchGoogleFn: async ({ query }) => ({
          results: [makeGoogleResult({ url: 'https://example.com/google-fallback', title: 'Google Fallback', query })],
        }),
      });

      assert.equal(usedFallback, true);
      assert.deepEqual(
        rows.map(({ provider, url }) => ({ provider, url })),
        [{ provider: 'google', url: 'https://example.com/google-fallback' }],
      );
    },
  );
});
