import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runSearchProviders,
  searchEngineAvailability,
  searchProviderAvailability,
  normalizeSearchEngines,
} from '../src/features/indexing/search/searchProviders.js';

function makeJsonResponse(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload;
    }
  };
}

function makeSearchConfig(overrides = {}) {
  return {
    searxngBaseUrl: 'http://127.0.0.1:8080',
    searxngMinQueryIntervalMs: 0,
    ...overrides,
  };
}

// ── normalizeSearchEngines migration ──

test('normalizeSearchEngines migrates legacy dual → bing,google', () => {
  assert.equal(normalizeSearchEngines('dual'), 'bing,google');
});

test('normalizeSearchEngines migrates legacy google → google', () => {
  assert.equal(normalizeSearchEngines('google'), 'google');
});

test('normalizeSearchEngines migrates legacy bing → bing', () => {
  assert.equal(normalizeSearchEngines('bing'), 'bing');
});

test('normalizeSearchEngines migrates legacy searxng → bing,startpage,duckduckgo', () => {
  assert.equal(normalizeSearchEngines('searxng'), 'bing,startpage,duckduckgo');
});

test('normalizeSearchEngines migrates legacy none → empty string', () => {
  assert.equal(normalizeSearchEngines('none'), '');
});

test('normalizeSearchEngines passes through valid CSV', () => {
  assert.equal(normalizeSearchEngines('bing,startpage,duckduckgo'), 'bing,startpage,duckduckgo');
});

test('normalizeSearchEngines strips invalid tokens from CSV', () => {
  assert.equal(normalizeSearchEngines('bing,yahoo,startpage'), 'bing,startpage');
});

test('normalizeSearchEngines deduplicates engines', () => {
  assert.equal(normalizeSearchEngines('bing,bing,google'), 'bing,google');
});

test('normalizeSearchEngines handles null/undefined', () => {
  assert.equal(normalizeSearchEngines(null), '');
  assert.equal(normalizeSearchEngines(undefined), '');
  assert.equal(normalizeSearchEngines(''), '');
});

test('normalizeSearchEngines is case insensitive', () => {
  assert.equal(normalizeSearchEngines('Bing,Google'), 'bing,google');
});

// ── runSearchProviders ──

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
          engine: 'startpage',
          engines: ['startpage']
        }
      ]
    });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchEngines: 'bing,startpage',
      }),
      query: 'razer viper v3 pro',
      limit: 5
    });

    assert.equal(calls, 1, 'exactly one fetch call');
    assert.ok(capturedUrl.includes('engines=bing%2Cstartpage'), `engines param present in URL: ${capturedUrl}`);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].provider, 'bing', 'per-result engine attribution from SearXNG');
    assert.equal(rows[1].provider, 'startpage', 'per-result engine attribution from SearXNG');
    assert.deepEqual(rows[0].engines, ['bing']);
    assert.deepEqual(rows[1].engines, ['startpage']);
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
    const rows = await runSearchProviders({
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

test('runSearchProviders backward compat: old searchProvider dual still works', async () => {
  const originalFetch = global.fetch;
  let capturedUrl = '';
  global.fetch = async (url) => {
    capturedUrl = String(url);
    return makeJsonResponse({
      results: [
        {
          url: 'https://example.com/spec',
          title: 'Spec',
          content: 'details'
        }
      ]
    });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'dual',
      }),
      query: 'logitech g pro x superlight 2',
      limit: 5
    });

    assert.ok(capturedUrl.includes('engines=bing%2Cgoogle'), `migrated engines in URL: ${capturedUrl}`);
    assert.equal(rows.length, 1);
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
    const rows = await runSearchProviders({
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
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchEngines: 'bing,google',
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
  const { searchSearxng } = await import('../src/features/indexing/search/searchProviders.js');
  const originalFetch = global.fetch;
  const timestamps = [];
  global.fetch = async () => {
    timestamps.push(Date.now());
    return {
      ok: true,
      async json() {
        return { results: [{ url: `https://example.com/r${timestamps.length}`, title: 'R', content: 'C' }] };
      }
    };
  };

  try {
    // Fire 6 rapid queries with a short min interval so jitter is observable
    for (let i = 0; i < 6; i++) {
      await searchSearxng({
        baseUrl: 'http://127.0.0.1:8080',
        query: `query ${i}`,
        limit: 1,
        minQueryIntervalMs: 200,
      });
    }
    const gaps = [];
    for (let i = 1; i < timestamps.length; i++) {
      gaps.push(timestamps[i] - timestamps[i - 1]);
    }
    // Every gap should be >= base interval
    for (const gap of gaps) {
      assert.ok(gap >= 190, `gap ${gap}ms should be >= ~200ms min interval`);
    }
    // Jitter adds 0–50% of base (0–100ms), so spread across 5 gaps should be > 20ms
    const spread = Math.max(...gaps) - Math.min(...gaps);
    assert.ok(spread > 20, `gap spread ${spread}ms should show jitter variance (not a fixed metronome)`);
  } finally {
    global.fetch = originalFetch;
  }
});

test('domain_hint is NOT injected into query string sent to provider', async () => {
  const originalFetch = global.fetch;
  const capturedQueries = [];

  global.fetch = async (url) => {
    const parsed = new URL(String(url));
    const q = parsed.searchParams.get('q');
    if (q) capturedQueries.push(q);
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
    for (const q of capturedQueries) {
      assert.equal(q, 'Razer Viper V3 Pro review',
        `query sent to provider is exactly the input query, got: "${q}"`);
      assert.ok(!q.includes('site:'), 'no site: operator injected');
      assert.ok(!q.includes('rtings.com'), 'no domain token injected');
    }
  } finally {
    global.fetch = originalFetch;
  }
});

// ── garbage result filtering ──

test('runSearchProviders drops results from engines that returned anti-bot garbage', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return makeJsonResponse({
      results: [
        // Good result from duckduckgo
        { url: 'https://rog.asus.com/chakram', title: 'ROG Chakram Specs', content: 'DPI 16000', engine: 'duckduckgo', engines: ['duckduckgo'] },
        // Bing anti-bot garbage — no query terms in title/url/content
        { url: 'https://www.dslreports.com/comment/4251/96367', title: 'Review of Ziply Fiber', content: 'ISP review', engine: 'bing', engines: ['bing'] },
        { url: 'http://www.jlaforums.com/viewforum.php?f=507', title: 'FOR SALE - Catskills, NY', content: 'classifieds', engine: 'bing', engines: ['bing'] },
        { url: 'https://es.wikipedia.org/wiki/Islas_Malvinas', title: 'Islas Malvinas', content: 'geography', engine: 'bing', engines: ['bing'] },
        { url: 'https://www.dslreports.com/forum/r32959625', title: 'Unusual access', content: 'network issue', engine: 'bing', engines: ['bing'] },
        { url: 'http://www.jlaforums.com/viewforum.php?f=175', title: 'FOR SALE - New York', content: 'listings', engine: 'bing', engines: ['bing'] },
        // Good result from bing (this one matches the query)
        { url: 'https://mousespecs.org/asus-rog-chakram/', title: 'Asus ROG Chakram Specs', content: 'Sensor specs', engine: 'bing', engines: ['bing'] },
      ]
    });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'bing,duckduckgo' }),
      query: 'Asus ROG Chakram specifications',
      limit: 10
    });

    // Bing's entire batch is poisoned (>50% garbage) — all bing results dropped
    const urls = rows.map(r => r.url);
    assert.ok(!urls.includes('https://www.dslreports.com/comment/4251/96367'), 'dslreports garbage dropped');
    assert.ok(!urls.includes('http://www.jlaforums.com/viewforum.php?f=507'), 'jlaforums garbage dropped');
    assert.ok(!urls.includes('https://es.wikipedia.org/wiki/Islas_Malvinas'), 'unrelated wikipedia dropped');
    // Good bing result also dropped — can't trust a poisoned engine batch
    assert.ok(!urls.includes('https://mousespecs.org/asus-rog-chakram/'), 'good bing result dropped with poisoned batch');
    // Good duckduckgo result survives — that engine wasn't poisoned
    assert.ok(urls.includes('https://rog.asus.com/chakram'), 'good duckduckgo result kept');
    assert.equal(rows.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

// ── searchEngineAvailability ──

test('searchEngineAvailability reports engine list and readiness', () => {
  const available = searchEngineAvailability({
    searchEngines: 'bing,startpage,duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.searxng_ready, true);
  assert.equal(available.internet_ready, true);
  assert.deepEqual(available.engines, ['bing', 'startpage', 'duckduckgo']);
  assert.equal(available.bing_ready, true);
  assert.equal(available.google_ready, false);
  assert.deepEqual(available.active_providers, ['bing', 'startpage', 'duckduckgo']);
});

test('searchEngineAvailability with empty engines reports not ready', () => {
  const available = searchEngineAvailability({
    searchEngines: '',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.internet_ready, false);
  assert.deepEqual(available.engines, []);
  assert.deepEqual(available.active_providers, []);
});

test('searchEngineAvailability with no searxng reports not ready', () => {
  const available = searchEngineAvailability({
    searchEngines: 'bing,google',
    searxngBaseUrl: ''
  });
  assert.equal(available.searxng_ready, false);
  assert.equal(available.internet_ready, false);
  assert.deepEqual(available.active_providers, []);
});

test('searchEngineAvailability backward compat: legacy searchProvider dual works', () => {
  const available = searchEngineAvailability({
    searchProvider: 'dual',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.internet_ready, true);
  assert.deepEqual(available.engines, ['bing', 'google']);
  assert.equal(available.bing_ready, true);
  assert.equal(available.google_ready, true);
});

test('searchProviderAvailability is an alias for searchEngineAvailability', () => {
  assert.equal(searchProviderAvailability, searchEngineAvailability);
});

// ── fallback engine behavior ──

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
    const rows = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
      query: 'test product specs',
      limit: 5
    });
    assert.equal(fetchCount, 1, 'only one fetch call — no fallback');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, 'https://example.com/primary');
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
    const rows = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'bing' }),
      query: 'test product specs',
      limit: 5
    });
    assert.equal(fetchCount, 2, 'two fetch calls — primary + fallback');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].url, 'https://example.com/fallback');
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
    const rows = await runSearchProviders({
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
    const rows = await runSearchProviders({
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
    const rows = await runSearchProviders({
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
    const fallbackEvent = logEvents.find(e => e.event === 'search_fallback_triggered');
    assert.ok(fallbackEvent, 'search_fallback_triggered event emitted');
    assert.equal(fallbackEvent.payload.query, 'test fallback logging');
    assert.equal(fallbackEvent.payload.primary_engines, 'duckduckgo');
    assert.equal(fallbackEvent.payload.fallback_engines, 'bing');
  } finally {
    global.fetch = originalFetch;
  }
});

test('searchEngineAvailability reports fallback engines', () => {
  const available = searchEngineAvailability({
    searchEngines: 'duckduckgo,brave',
    searchEnginesFallback: 'bing',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.deepEqual(available.fallback_engines, ['bing']);
  assert.equal(available.fallback_ready, true);
});

test('searchEngineAvailability reports empty fallback when not configured', () => {
  const available = searchEngineAvailability({
    searchEngines: 'duckduckgo',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.deepEqual(available.fallback_engines, []);
  assert.equal(available.fallback_ready, false);
});
