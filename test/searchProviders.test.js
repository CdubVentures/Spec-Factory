import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runSearchProviders,
  searchProviderAvailability
} from '../src/features/indexing/search/searchProviders.js';

function makeJsonResponse(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload;
    }
  };
}

function makeTextResponse(payload, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    async text() {
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

test('searchProviderAvailability includes searxng readiness', () => {
  const available = searchProviderAvailability({
    searchProvider: 'searxng',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.provider, 'searxng');
  assert.equal(available.searxng_ready, true);
  assert.equal(available.internet_ready, true);
});

test('searchProviderAvailability reports keyless Google/Bing readiness without CSE diagnostics', () => {
  const available = searchProviderAvailability({
    searchProvider: 'dual',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.google_ready, true);
  assert.equal(available.bing_ready, true);
  assert.equal(available.active_providers.includes('google'), true);
  assert.equal(Object.hasOwn(available, 'google_cse_disabled'), false);
  assert.equal(Object.hasOwn(available, 'google_missing_credentials'), false);
  assert.equal(Object.hasOwn(available, 'bing_missing_credentials'), false);
});

test('searchProviderAvailability ignores legacy direct-search knobs when no live provider is configured', () => {
  const available = searchProviderAvailability({
    searchProvider: 'dual',
    searxngBaseUrl: '',
    bingSearchEndpoint: 'https://api.bing.microsoft.com/v7.0/search',
    bingSearchKey: 'retired-bing-key',
    googleCseKey: 'retired-key',
    googleCseCx: 'retired-cx',
    disableGoogleCse: false
  });

  assert.equal(available.google_ready, false);
  assert.equal(available.bing_ready, false);
  assert.deepEqual(available.active_providers, []);
  assert.equal(available.fallback_reason, 'no_provider_ready');
  assert.equal(available.internet_ready, false);
});

test('searchProviderAvailability marks bing as internet-ready via free fallback when keyless', () => {
  const available = searchProviderAvailability({
    searchProvider: 'bing',
    searxngBaseUrl: 'http://127.0.0.1:8080'
  });
  assert.equal(available.provider, 'bing');
  assert.equal(available.bing_ready, true);
  assert.equal(available.internet_ready, true);
  assert.equal(available.active_providers.includes('searxng'), true);
});

test('runSearchProviders returns searxng results for searxng provider', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    const token = String(url);
    assert.equal(token.includes('format=json'), true);
    assert.equal(token.includes('q=logitech'), true);
    return makeJsonResponse({
      results: [
        {
          url: 'https://example.com/spec',
          title: 'Spec Page',
          content: 'Polling rate 8000 Hz'
        }
      ]
    });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'searxng',
        searxngTimeoutMs: 5_000,
        searchCacheTtlSeconds: 0
      }),
      query: 'logitech',
      limit: 5
    });

    assert.equal(calls, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, 'searxng');
    assert.equal(rows[0].url, 'https://example.com/spec');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders uses SearXNG Google engine for google provider', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    const token = String(url || '');
    assert.equal(token.includes('format=json'), true);
    assert.equal(token.includes('engines=google'), true);
    assert.equal(token.includes('q=razer+viper+v3+pro') || token.includes('q=razer%20viper%20v3%20pro'), true);
    return makeJsonResponse({
      results: [
        {
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          title: 'Razer Viper V3 Pro',
          content: 'Official product page'
        }
      ]
    });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'google',
        googleCseKey: '',
        googleCseCx: '',
        searchCacheTtlSeconds: 0
      }),
      query: 'razer viper v3 pro',
      limit: 5
    });

    assert.equal(calls, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, 'google');
    assert.equal(rows[0].url, 'https://www.razer.com/gaming-mice/razer-viper-v3-pro');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders bing provider does not call Bing API endpoint even when legacy keys are present', async () => {
  const originalFetch = global.fetch;
  let calledBingApi = false;
  global.fetch = async (url) => {
    const token = String(url || '');
    if (token.includes('api.bing.microsoft.com')) {
      calledBingApi = true;
      return makeJsonResponse({ webPages: { value: [] } });
    }
    if (token.includes('format=json') && token.includes('engines=bing')) {
      return makeJsonResponse({
        results: [
          {
            url: 'https://example.com/keyless-bing-result',
            title: 'Keyless Bing Result',
            content: 'Result via SearXNG bing engine'
          }
        ]
      });
    }
    return makeJsonResponse({ results: [] });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'bing',
        bingSearchEndpoint: 'https://api.bing.microsoft.com/v7.0/search',
        bingSearchKey: 'legacy-bing-key',
      }),
      query: 'keyless bing provider test',
      limit: 5
    });

    assert.equal(calledBingApi, false);
    assert.equal(rows.length > 0, true);
    assert.equal(rows[0].provider, 'bing');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders google provider never calls Google CSE API endpoint', async () => {
  const originalFetch = global.fetch;
  let calledGoogleApi = false;
  global.fetch = async (url) => {
    const token = String(url || '');
    if (token.includes('googleapis.com/customsearch')) {
      calledGoogleApi = true;
      return makeJsonResponse({ items: [] });
    }
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
        searchProvider: 'google',
        googleCseKey: 'legacy-key',
        googleCseCx: 'legacy-cx'
      }),
      query: 'viper specs',
      limit: 5
    });

    assert.equal(calledGoogleApi, false);
    assert.equal(rows.length > 0, true);
    assert.equal(rows[0].provider, 'google');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders dual mode falls back to searxng when bing/google are unavailable', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    const token = String(url || '');
    if (token.includes('engines=google') || token.includes('engines=bing')) {
      return makeJsonResponse({ results: [] });
    }
    if (token.includes('format=json')) {
      return makeJsonResponse({
        results: [
          {
            url: 'https://docs.vendor.com/manual.pdf',
            title: 'Manual',
            content: 'DPI and polling details'
          }
        ]
      });
    }
    return makeTextResponse(
      '<a class="result__a" href="https://vendor.example/backup">Backup Result</a>'
    );
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'dual',
        bingSearchEndpoint: '',
        bingSearchKey: '',
        googleCseKey: '',
        googleCseCx: '',
        searchCacheTtlSeconds: 0
      }),
      query: 'viper v3 pro dpi',
      limit: 6
    });

    assert.equal(calls, 3);
    assert.equal(rows.some((row) => row.provider === 'searxng'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders google mode falls back to bing sequentially and stops after first hit', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const token = String(url || '');
    calls.push(token);
    if (token.includes('engines=google')) {
      return makeJsonResponse({ results: [] });
    }
    if (token.includes('engines=bing')) {
      return makeJsonResponse({
        results: [
          {
            url: 'https://example.com/bing-fallback-result',
            title: 'Bing fallback result',
            content: 'Recovered from bing lane'
          }
        ]
      });
    }
    return makeJsonResponse({
      results: [
        {
          url: 'https://example.com/should-not-run',
          title: 'Unexpected fallback',
          content: 'Unexpected fallback'
        }
      ]
    });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'google',
      }),
      query: 'Razer Viper V3 Pro connection',
      limit: 5
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, 'bing_fallback');
    assert.equal(calls.length, 2);
    assert.equal(calls.some((token) => token.includes('engines=google')), true);
    assert.equal(calls.some((token) => token.includes('engines=bing')), true);
    assert.equal(calls.some((token) => token.includes('format=json') && !token.includes('engines=')), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders does not call Google CSE endpoints even with legacy CSE knobs present', async () => {
  const originalFetch = global.fetch;
  let calledGoogleCse = false;
  global.fetch = async (url) => {
    const token = String(url || '');
    if (token.includes('googleapis.com/customsearch')) {
      calledGoogleCse = true;
      return makeJsonResponse({ items: [] });
    }
    if (token.includes('format=json')) {
      return makeJsonResponse({
        results: [{ url: 'https://example.com/spec', title: 'Spec', content: 'details' }]
      });
    }
    return makeJsonResponse({ results: [] });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'dual',
        googleCseKey: 'would-have-been-used',
        googleCseCx: 'would-have-been-used',
      }),
      query: 'hyperx pulsefire haste 2 core wireless',
      limit: 5
    });

    assert.equal(calledGoogleCse, false);
    assert.equal(rows.length > 0, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('runSearchProviders applies request throttler slots per engine host in dual mode', async () => {
  const originalFetch = global.fetch;
  const throttleKeys = [];
  global.fetch = async (url) => {
    const token = String(url || '');
    if (token.includes('format=json')) {
      return makeJsonResponse({
        results: [
          {
            url: 'https://example.com/searxng-spec',
            title: 'SearXNG Spec',
            content: 'searxng result'
          }
        ]
      });
    }
    return makeJsonResponse({ results: [] });
  };

  try {
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'dual',
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
    const rows = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'searxng',
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

    assert.equal(rows.length, 1);
    const throttled = infoEvents.find((row) => row.event === 'search_request_throttled');
    assert.ok(throttled);
    assert.equal(throttled.payload.provider, 'searxng');
    assert.equal(throttled.payload.query, 'g pro x superlight 2');
    assert.equal(throttled.payload.wait_ms, 420);
  } finally {
    global.fetch = originalFetch;
  }
});
