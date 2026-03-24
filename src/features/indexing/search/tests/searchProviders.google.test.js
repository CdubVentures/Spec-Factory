import test from 'node:test';
import assert from 'node:assert/strict';
import { runSearchProviders } from '../searchProviders.js';
import { makeJsonResponse, makeSearchConfig } from '../../../../../test/helpers/searchProviderHarness.js';

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

  const mockSearchGoogle = async ({ query }) => ({
    results: [{ url: 'https://example.com/google-dual', title: 'Google Dual', snippet: 'data', provider: 'google', query }]
  });

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({
        searchProvider: 'dual',
      }),
      query: 'logitech g pro x superlight 2',
      limit: 5,
      _searchGoogleFn: mockSearchGoogle,
    });

    assert.ok(capturedUrl.includes('engines=bing'), `SearXNG gets bing from dual: ${capturedUrl}`);
    assert.ok(!capturedUrl.includes('google'), 'SearXNG does NOT get google from dual');
    assert.equal(rows.length, 2, 'both google (Crawlee) and bing (SearXNG) results');
  } finally {
    global.fetch = originalFetch;
  }
});

test('google engine routes through searchGoogle, not SearXNG fetch', async () => {
  const originalFetch = global.fetch;
  let searxngFetchCount = 0;
  global.fetch = async () => {
    searxngFetchCount++;
    return makeJsonResponse({ results: [] });
  };

  let googleCallCount = 0;
  const mockSearchGoogle = async ({ query }) => {
    googleCallCount++;
    return {
      results: [
        { url: 'https://example.com/google-result', title: 'Google Result', snippet: 'via Crawlee', provider: 'google', query }
      ]
    };
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'google' }),
      query: 'logitech mx master 3s',
      limit: 5,
      _searchGoogleFn: mockSearchGoogle,
    });

    assert.equal(searxngFetchCount, 0, 'SearXNG fetch was NOT called for google');
    assert.equal(googleCallCount, 1, 'searchGoogle was called once');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, 'google');
    assert.equal(rows[0].url, 'https://example.com/google-result');
  } finally {
    global.fetch = originalFetch;
  }
});

test('google,bing splits: google via Crawlee, bing via SearXNG, results merged', async () => {
  const originalFetch = global.fetch;
  let searxngFetchCount = 0;
  global.fetch = async (url) => {
    searxngFetchCount++;
    const urlStr = String(url);
    assert.ok(urlStr.includes('engines=bing'), `SearXNG only gets bing, got: ${urlStr}`);
    assert.ok(!urlStr.includes('google'), 'SearXNG must NOT get google');
    return makeJsonResponse({
      results: [
        { url: 'https://example.com/bing-result', title: 'Bing Result', content: 'from bing', engine: 'bing', engines: ['bing'] }
      ]
    });
  };

  let googleCallCount = 0;
  const mockSearchGoogle = async ({ query }) => {
    googleCallCount++;
    return {
      results: [
        { url: 'https://example.com/google-result', title: 'Google Result', snippet: 'via Crawlee', provider: 'google', query }
      ]
    };
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'google,bing' }),
      query: 'test dual',
      limit: 5,
      _searchGoogleFn: mockSearchGoogle,
    });

    assert.equal(googleCallCount, 1, 'searchGoogle called once');
    assert.equal(searxngFetchCount, 1, 'SearXNG called once for bing');
    assert.equal(rows.length, 2, 'merged results from both');
    const providers = rows.map((row) => row.provider).sort();
    assert.deepEqual(providers, ['bing', 'google'], 'both providers present');
  } finally {
    global.fetch = originalFetch;
  }
});

test('fallback with google also routes through Crawlee', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => makeJsonResponse({ results: [] });

  let googleCallCount = 0;
  const mockSearchGoogle = async ({ query }) => {
    googleCallCount++;
    return {
      results: [
        { url: 'https://example.com/google-fallback', title: 'Google Fallback', snippet: 'fb', provider: 'google', query }
      ]
    };
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'duckduckgo', searchEnginesFallback: 'google' }),
      query: 'test fallback google',
      limit: 5,
      _searchGoogleFn: mockSearchGoogle,
    });

    assert.equal(googleCallCount, 1, 'google fallback routed through Crawlee');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider, 'google');
  } finally {
    global.fetch = originalFetch;
  }
});

test('legacy dual routes google through Crawlee', async () => {
  const originalFetch = global.fetch;
  let searxngEngines = '';
  global.fetch = async (url) => {
    const parsed = new URL(String(url));
    searxngEngines = parsed.searchParams.get('engines') || '';
    return makeJsonResponse({
      results: [
        { url: 'https://example.com/bing', title: 'Bing', content: 'data', engine: 'bing', engines: ['bing'] }
      ]
    });
  };

  let googleCalled = false;
  const mockSearchGoogle = async ({ query }) => {
    googleCalled = true;
    return {
      results: [
        { url: 'https://example.com/google', title: 'Google', snippet: 'data', provider: 'google', query }
      ]
    };
  };

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchProvider: 'dual' }),
      query: 'legacy dual test',
      limit: 5,
      _searchGoogleFn: mockSearchGoogle,
    });

    assert.equal(googleCalled, true, 'google routed through Crawlee from legacy dual');
    assert.equal(searxngEngines, 'bing', 'SearXNG only gets bing from legacy dual');
    assert.equal(rows.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('screenshotSink is called when google returns a screenshot', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => makeJsonResponse({ results: [] });

  const sinkCalls = [];
  const mockSearchGoogle = async ({ query }) => ({
    results: [{ url: 'https://example.com/g', title: 'G', snippet: 's', provider: 'google', query }],
    screenshot: { buffer: Buffer.from('fake-jpeg'), width: 1920, height: 1080, bytes: 9, ts: '2026-03-18T00:00:00Z', queryHash: 'abc123' },
  });

  try {
    const { results: rows } = await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'google', googleSearchScreenshotsEnabled: true }),
      query: 'screenshot test',
      limit: 5,
      _searchGoogleFn: mockSearchGoogle,
      screenshotSink: async (data) => { sinkCalls.push(data); },
    });

    assert.equal(rows.length, 1);
    assert.equal(sinkCalls.length, 1, 'screenshotSink called once');
    assert.ok(Buffer.isBuffer(sinkCalls[0].buffer), 'buffer passed to sink');
    assert.equal(sinkCalls[0].queryHash, 'abc123');
    assert.equal(sinkCalls[0].query, 'screenshot test');
  } finally {
    global.fetch = originalFetch;
  }
});

test('screenshotSink is NOT called when screenshots are disabled', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => makeJsonResponse({ results: [] });

  const sinkCalls = [];
  const mockSearchGoogle = async ({ query, screenshotsEnabled }) => ({
    results: [{ url: 'https://example.com/g', title: 'G', snippet: 's', provider: 'google', query }],
    ...(screenshotsEnabled ? { screenshot: { buffer: Buffer.from('jpeg'), width: 1920, height: 1080, bytes: 4, ts: 'T', queryHash: 'h' } } : {}),
  });

  try {
    await runSearchProviders({
      config: makeSearchConfig({ searchEngines: 'google', googleSearchScreenshotsEnabled: false }),
      query: 'no screenshot',
      limit: 5,
      _searchGoogleFn: mockSearchGoogle,
      screenshotSink: async (data) => { sinkCalls.push(data); },
    });

    assert.equal(sinkCalls.length, 0, 'screenshotSink NOT called when disabled');
  } finally {
    global.fetch = originalFetch;
  }
});
