import test from 'node:test';
import assert from 'node:assert/strict';
import { runSearchProviders } from '../searchProviders.js';
import {
  makeSearchConfig,
  makeSearchResponse,
  makeSearchResult,
} from './helpers/searchProviderHarness.js';

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

test('runSearchProviders returns normalized provider rows for configured SearXNG engines', async () => {
  await withMockFetch(
    async () => makeSearchResponse([
      makeProviderRow({
        url: 'https://example.com/spec',
        title: 'Spec Page',
        content: 'Polling rate 8000 Hz',
        engine: 'bing',
        engines: ['bing'],
      }),
      makeProviderRow({
        url: 'https://example.com/spec2',
        title: 'Spec Page 2',
        content: 'DPI 26000',
        engine: 'duckduckgo',
        engines: ['duckduckgo'],
      }),
    ]),
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({
          searchEngines: 'bing,duckduckgo',
        }),
        query: 'razer viper v3 pro',
        limit: 5,
      });

      assert.equal(usedFallback, false);
      assert.deepEqual(
        rows.map(({ url, provider, engines }) => ({ url, provider, engines })),
        [
          { url: 'https://example.com/spec', provider: 'bing', engines: ['bing'] },
          { url: 'https://example.com/spec2', provider: 'duckduckgo', engines: ['duckduckgo'] },
        ],
      );
    },
  );
});

for (const scenario of [
  {
    name: 'runSearchProviders returns an empty contract when searchEngines is blank',
    config: makeSearchConfig({ searchEngines: '' }),
  },
  {
    name: 'runSearchProviders returns an empty contract for legacy searchProvider none',
    config: makeSearchConfig({ searchProvider: 'none' }),
  },
]) {
  test(scenario.name, async () => {
    await withMockFetch(
      async () => makeSearchResponse([]),
      async () => {
        const result = await runSearchProviders({
          config: scenario.config,
          query: 'test query',
          limit: 5,
        });

        assert.deepEqual(result, { results: [], usedFallback: false });
      },
    );
  });
}

test('runSearchProviders drops poisoned engine batches and keeps the clean results', async () => {
  await withMockFetch(
    async () => makeSearchResponse([
      makeProviderRow({
        url: 'https://rog.asus.com/chakram',
        title: 'ROG Chakram Specs',
        content: 'DPI 16000',
        engine: 'duckduckgo',
        engines: ['duckduckgo'],
      }),
      makeProviderRow({
        url: 'https://www.dslreports.com/comment/4251/96367',
        title: 'Review of Ziply Fiber',
        content: 'ISP review',
        engine: 'bing',
        engines: ['bing'],
      }),
      makeProviderRow({
        url: 'http://www.jlaforums.com/viewforum.php?f=507',
        title: 'FOR SALE - Catskills, NY',
        content: 'classifieds',
        engine: 'bing',
        engines: ['bing'],
      }),
      makeProviderRow({
        url: 'https://es.wikipedia.org/wiki/Islas_Malvinas',
        title: 'Islas Malvinas',
        content: 'geography',
        engine: 'bing',
        engines: ['bing'],
      }),
      makeProviderRow({
        url: 'https://www.dslreports.com/forum/r32959625',
        title: 'Unusual access',
        content: 'network issue',
        engine: 'bing',
        engines: ['bing'],
      }),
      makeProviderRow({
        url: 'http://www.jlaforums.com/viewforum.php?f=175',
        title: 'FOR SALE - New York',
        content: 'listings',
        engine: 'bing',
        engines: ['bing'],
      }),
      makeProviderRow({
        url: 'https://mousespecs.org/asus-rog-chakram/',
        title: 'Asus ROG Chakram Specs',
        content: 'Sensor specs',
        engine: 'bing',
        engines: ['bing'],
      }),
    ]),
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'bing,duckduckgo' }),
        query: 'Asus ROG Chakram specifications',
        limit: 10,
      });

      assert.equal(usedFallback, false);
      assert.deepEqual(
        rows.map(({ url, provider }) => ({ url, provider })),
        [{ url: 'https://rog.asus.com/chakram', provider: 'duckduckgo' }],
      );
    },
  );
});

test('runSearchProviders returns primary results without using fallback when the primary search succeeds', async () => {
  await withMockFetch(
    async () => makeSearchResponse([
      makeProviderRow({
        url: 'https://example.com/primary',
        title: 'Primary Result',
        content: 'specs',
        engine: 'duckduckgo',
        engines: ['duckduckgo'],
      }),
    ]),
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
        query: 'test product specs',
        limit: 5,
      });

      assert.equal(usedFallback, false);
      assert.deepEqual(
        rows.map(({ url, provider }) => ({ url, provider })),
        [{ url: 'https://example.com/primary', provider: 'duckduckgo' }],
      );
    },
  );
});

test('runSearchProviders returns fallback results when the primary search returns nothing usable', async () => {
  await withMockFetch(
    async (url) => {
      if (String(url).includes('engines=duckduckgo')) {
        return makeSearchResponse([]);
      }
      return makeSearchResponse([
        makeProviderRow({
          url: 'https://example.com/fallback',
          title: 'Fallback Result',
          content: 'specs from bing',
          engine: 'bing',
          engines: ['bing'],
        }),
      ]);
    },
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
        query: 'test product specs',
        limit: 5,
      });

      assert.equal(usedFallback, true);
      assert.deepEqual(
        rows.map(({ url, provider }) => ({ url, provider })),
        [{ url: 'https://example.com/fallback', provider: 'bing' }],
      );
    },
  );
});

test('runSearchProviders returns fallback results when the primary batch is filtered as garbage', async () => {
  await withMockFetch(
    async (url) => {
      if (String(url).includes('engines=duckduckgo')) {
        return makeSearchResponse([
          makeProviderRow({
            url: 'https://jlaforums.com/junk1',
            title: 'FOR SALE',
            content: 'classifieds',
            engine: 'duckduckgo',
            engines: ['duckduckgo'],
          }),
          makeProviderRow({
            url: 'https://jlaforums.com/junk2',
            title: 'FOR SALE NY',
            content: 'listings',
            engine: 'duckduckgo',
            engines: ['duckduckgo'],
          }),
          makeProviderRow({
            url: 'https://dslreports.com/junk',
            title: 'Ziply Fiber',
            content: 'ISP',
            engine: 'duckduckgo',
            engines: ['duckduckgo'],
          }),
        ]);
      }
      return makeSearchResponse([
        makeProviderRow({
          url: 'https://example.com/fallback-good',
          title: 'Razer Viper Specs',
          content: 'DPI sensor',
          engine: 'bing',
          engines: ['bing'],
        }),
      ]);
    },
    async () => {
      const { results: rows, usedFallback } = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
        query: 'Razer Viper specifications',
        limit: 5,
      });

      assert.equal(usedFallback, true);
      assert.deepEqual(
        rows.map(({ url, provider }) => ({ url, provider })),
        [{ url: 'https://example.com/fallback-good', provider: 'bing' }],
      );
    },
  );
});

test('runSearchProviders returns an empty contract when neither primary nor fallback yields usable rows', async () => {
  await withMockFetch(
    async () => makeSearchResponse([]),
    async () => {
      const result = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
        query: 'nonexistent product',
        limit: 5,
      });

      assert.deepEqual(result, { results: [], usedFallback: false });
    },
  );
});

test('runSearchProviders returns an empty contract when fallback is not configured', async () => {
  await withMockFetch(
    async () => makeSearchResponse([]),
    async () => {
      const result = await runSearchProviders({
        config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: '' }),
        query: 'test query',
        limit: 5,
      });

      assert.deepEqual(result, { results: [], usedFallback: false });
    },
  );
});
