import test from 'node:test';
import assert from 'node:assert/strict';
import { runSearchProviders } from '../src/features/indexing/search/searchProviders.js';
import { makeJsonResponse, makeSearchConfig } from './helpers/searchProviderHarness.js';

test('runSearchProviders with searchEngines sends one fetch with engines param', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  let capturedUrl = '';
  global.fetch = async (url) => {
    calls += 1;
    capturedUrl = String(url);
    return makeJsonResponse({
      results: [
        {
          url: 'https://example.com/spec',
          title: 'Spec Page',
          content: 'Polling rate 8000 Hz',
          engine: 'bing',
          engines: ['bing']
        },
        {
          url: 'https://example.com/spec2',
          title: 'Spec Page 2',
          content: 'DPI 26000',
          engine: 'duckduckgo',
          engines: ['duckduckgo']
        }
      ]
    });
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({
        searchEngines: 'bing,duckduckgo',
      }),
      query: 'razer viper v3 pro',
      limit: 5
    });

    assert.equal(calls, 1, 'exactly one fetch call');
    assert.ok(capturedUrl.includes('engines=bing%2Cduckduckgo'), `engines param sent to SearXNG: ${capturedUrl}`);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].provider, 'bing', 'per-result engine attribution from SearXNG');
    assert.equal(rows[1].provider, 'duckduckgo', 'per-result engine attribution from SearXNG');
    assert.deepEqual(rows[0].engines, ['bing']);
    assert.deepEqual(rows[1].engines, ['duckduckgo']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders with searchEngines empty string returns [] immediately', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return makeJsonResponse({ results: [] });
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({
        searchEngines: '',
      }),
      query: 'razer viper v3 pro',
      limit: 5
    });

    assert.equal(calls, 0, 'no fetch calls for empty engines');
    assert.deepEqual(rows, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders backward compat: old searchProvider none returns []', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return makeJsonResponse({ results: [] });
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'none',
      }),
      query: 'test query',
      limit: 5
    });

    assert.equal(calls, 0);
    assert.deepEqual(rows, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders applies request throttler', async () => {
  const originalFetch = global.fetch;
  const throttleKeys = [];
  global.fetch = async () => {
    return makeJsonResponse({
      results: [
        {
          url: 'https://example.com/searxng-spec',
          title: 'SearXNG Spec',
          content: 'searxng result'
        }
      ]
    });
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({
        searchEngines: 'bing',
      }),
      query: 'g pro x superlight 2',
      limit: 6,
      requestThrottler: {
        async acquire({ key }) {
          throttleKeys.push(String(key || ''));
        }
      }
    });

    assert.equal(rows.length >= 1, true);
    assert.equal(throttleKeys.includes('127.0.0.1'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders emits search_request_throttled event when acquire waits', async () => {
  const originalFetch = global.fetch;
  const infoEvents = [];
  global.fetch = async () =>
    makeJsonResponse({
      results: [
        {
          url: 'https://example.com/searxng-spec',
          title: 'SearXNG Spec',
          content: 'searxng result'
        }
      ]
    });

  try {
    await runSearchProviders({
      config: makeSearchConfig({
        searchEngines: 'bing',
      }),
      query: 'g pro x superlight 2',
      limit: 5,
      logger: {
        info(event, payload) {
          infoEvents.push({ event, payload });
        }
      },
      requestThrottler: {
        async acquire() {
          return 420;
        }
      }
    });

    const throttled = infoEvents.find((row) => row.event === 'search_request_throttled');
    assert.ok(throttled);
    assert.equal(throttled.payload.query, 'g pro x superlight 2');
    assert.equal(throttled.payload.wait_ms, 420);
  } finally {
    global.fetch = originalFetch;
  }
});

test('searchSearxng adds random jitter to inter-query delay', async () => {
  const { searchSearxng } = await import('../src/features/indexing/search/searchSearxng.js');
  const originalFetch = global.fetch;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalRandom = Math.random;
  const delays = [];
  const jitterSamples = [0.01, 0.93, 0.22, 0.77, 0.35, 0.88];
  let jitterIndex = 0;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { results: [{ url: `https://example.com/r${delays.length + 1}`, title: 'R', content: 'C' }] };
    }
  });
  global.setTimeout = (callback, delay, ...args) => {
    if (Number(delay) < 1_000) {
      delays.push(Number(delay));
      callback(...args);
      return 0;
    }
    return originalSetTimeout(callback, delay, ...args);
  };
  global.clearTimeout = (token) => {
    if (token === 0) return;
    return originalClearTimeout(token);
  };
  Math.random = () => {
    const value = jitterSamples[jitterIndex % jitterSamples.length];
    jitterIndex += 1;
    return value;
  };

  try {
    for (let i = 0; i < 6; i++) {
      await searchSearxng({
        baseUrl: 'http://127.0.0.1:8080',
        query: `query ${i}`,
        limit: 1,
        minQueryIntervalMs: 200,
      });
    }
    assert.equal(delays.length, 6, 'one scheduled pacing delay per query');
    for (const delay of delays) {
      assert.ok(delay >= 200, `delay ${delay}ms should be >= base interval`);
    }
    const spread = Math.max(...delays) - Math.min(...delays);
    assert.ok(spread > 20, `delay spread ${spread}ms should show jitter variance (not a fixed metronome)`);
  } finally {
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    Math.random = originalRandom;
  }
});

test('domain_hint is NOT injected into query string sent to provider', async () => {
  const originalFetch = global.fetch;
  const capturedQueries = [];

  global.fetch = async (url) => {
    const parsed = new URL(String(url));
    const query = parsed.searchParams.get('q');
    if (query) capturedQueries.push(query);
    return makeJsonResponse({
      results: [
        {
          url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro',
          title: 'Razer Viper V3 Pro Review',
          content: 'Click latency 0.5ms'
        }
      ]
    });
  };

  try {
    await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'bing' }),
      query: 'Razer Viper V3 Pro review',
      limit: 5
    });

    assert.ok(capturedQueries.length > 0, 'at least one query sent');
    for (const query of capturedQueries) {
      assert.equal(query, 'Razer Viper V3 Pro review',
        `query sent to provider is exactly the input query, got: "${query}"`);
      assert.ok(!query.includes('site:'), 'no site: operator injected');
      assert.ok(!query.includes('rtings.com'), 'no domain token injected');
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders drops results from engines that returned anti-bot garbage', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return makeJsonResponse({
      results: [
        { url: 'https://rog.asus.com/chakram', title: 'ROG Chakram Specs', content: 'DPI 16000', engine: 'duckduckgo', engines: ['duckduckgo'] },
        { url: 'https://www.dslreports.com/comment/4251/96367', title: 'Review of Ziply Fiber', content: 'ISP review', engine: 'bing', engines: ['bing'] },
        { url: 'http://www.jlaforums.com/viewforum.php?f=507', title: 'FOR SALE - Catskills, NY', content: 'classifieds', engine: 'bing', engines: ['bing'] },
        { url: 'https://es.wikipedia.org/wiki/Islas_Malvinas', title: 'Islas Malvinas', content: 'geography', engine: 'bing', engines: ['bing'] },
        { url: 'https://www.dslreports.com/forum/r32959625', title: 'Unusual access', content: 'network issue', engine: 'bing', engines: ['bing'] },
        { url: 'http://www.jlaforums.com/viewforum.php?f=175', title: 'FOR SALE - New York', content: 'listings', engine: 'bing', engines: ['bing'] },
        { url: 'https://mousespecs.org/asus-rog-chakram/', title: 'Asus ROG Chakram Specs', content: 'Sensor specs', engine: 'bing', engines: ['bing'] },
      ]
    });
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'bing,duckduckgo' }),
      query: 'Asus ROG Chakram specifications',
      limit: 10
    });

    const urls = rows.map((row) => row.url);
    assert.ok(!urls.includes('https://www.dslreports.com/comment/4251/96367'), 'dslreports garbage dropped');
    assert.ok(!urls.includes('http://www.jlaforums.com/viewforum.php?f=507'), 'jlaforums garbage dropped');
    assert.ok(!urls.includes('https://es.wikipedia.org/wiki/Islas_Malvinas'), 'unrelated wikipedia dropped');
    assert.ok(!urls.includes('https://mousespecs.org/asus-rog-chakram/'), 'good bing result dropped with poisoned batch');
    assert.ok(urls.includes('https://rog.asus.com/chakram'), 'good duckduckgo result kept');
    assert.equal(rows.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders does NOT trigger fallback when primary returns results', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount++;
    return makeJsonResponse({
      results: [{ url: 'https://example.com/primary', title: 'Primary Result', content: 'specs', engine: 'duckduckgo', engines: ['duckduckgo'] }]
    });
  };

  try {
    const { results: rows, usedFallback } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
      query: 'test product specs',
      limit: 5
    });
    assert.equal(fetchCount, 1, 'only one fetch call — no fallback');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, 'https://example.com/primary');
    assert.equal(usedFallback, false, 'usedFallback is false when primary succeeds');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders triggers fallback when primary returns 0 results', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async (url) => {
    fetchCount++;
    const urlStr = String(url);
    if (urlStr.includes('engines=duckduckgo')) {
      return makeJsonResponse({ results: [] });
    }
    return makeJsonResponse({
      results: [{ url: 'https://example.com/fallback', title: 'Fallback Result', content: 'specs from bing', engine: 'bing', engines: ['bing'] }]
    });
  };

  try {
    const { results: rows, usedFallback } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
      query: 'test product specs',
      limit: 5
    });
    assert.equal(fetchCount, 2, 'two fetch calls — primary + fallback');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, 'https://example.com/fallback');
    assert.equal(usedFallback, true, 'usedFallback is true when fallback provided results');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders triggers fallback when primary results are all garbage-filtered', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async (url) => {
    fetchCount++;
    const urlStr = String(url);
    if (urlStr.includes('engines=duckduckgo')) {
      return makeJsonResponse({
        results: [
          { url: 'https://jlaforums.com/junk1', title: 'FOR SALE', content: 'classifieds', engine: 'duckduckgo', engines: ['duckduckgo'] },
          { url: 'https://jlaforums.com/junk2', title: 'FOR SALE NY', content: 'listings', engine: 'duckduckgo', engines: ['duckduckgo'] },
          { url: 'https://dslreports.com/junk', title: 'Ziply Fiber', content: 'ISP', engine: 'duckduckgo', engines: ['duckduckgo'] },
        ]
      });
    }
    return makeJsonResponse({
      results: [{ url: 'https://example.com/fallback-good', title: 'Razer Viper Specs', content: 'DPI sensor', engine: 'bing', engines: ['bing'] }]
    });
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
      query: 'Razer Viper specifications',
      limit: 5
    });
    assert.equal(fetchCount, 2, 'fallback triggered after garbage filter');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, 'https://example.com/fallback-good');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders returns empty when both primary and fallback return 0', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => makeJsonResponse({ results: [] });

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
      query: 'nonexistent product',
      limit: 5
    });
    assert.deepEqual(rows, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders with empty searchEnginesFallback does not attempt fallback', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount++;
    return makeJsonResponse({ results: [] });
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: '' }),
      query: 'test query',
      limit: 5
    });
    assert.equal(fetchCount, 1, 'only one fetch call — no fallback configured');
    assert.deepEqual(rows, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders logs search_fallback_triggered when fallback fires', async () => {
  const originalFetch = global.fetch;
  const logEvents = [];
  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('engines=duckduckgo')) {
      return makeJsonResponse({ results: [] });
    }
    return makeJsonResponse({
      results: [{ url: 'https://example.com/fb', title: 'Fallback', content: 'data', engine: 'bing', engines: ['bing'] }]
    });
  };

  try {
    await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
      query: 'test fallback logging',
      limit: 5,
      logger: {
        info(event, payload) { logEvents.push({ event, payload }); },
        warn(event, payload) { logEvents.push({ event, payload }); },
      }
    });
    const fallbackEvent = logEvents.find((row) => row.event === 'search_fallback_triggered');
    assert.ok(fallbackEvent, 'search_fallback_triggered event emitted');
    assert.equal(fallbackEvent.payload.query, 'test fallback logging');
    assert.equal(fallbackEvent.payload.primary_engines, 'duckduckgo');
    assert.equal(fallbackEvent.payload.fallback_engines, 'bing');
  } finally {
    global.fetch = originalFetch;
  }
});
