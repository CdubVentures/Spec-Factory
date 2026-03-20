import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  return import('../searchSerper.js');
}

// ---------------------------------------------------------------------------
// Mock fetch factory
// ---------------------------------------------------------------------------

function createMockFetch({ status = 200, body = {}, shouldThrow = false } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    if (shouldThrow) throw new Error('Network error');
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return { fn, calls };
}

function serperResponse(resultCount = 10) {
  return {
    searchParameters: { q: 'test', gl: 'us', hl: 'en', num: resultCount },
    organic: Array.from({ length: resultCount }, (_, i) => ({
      title: `Result ${i + 1}`,
      link: `https://example.com/page-${i + 1}`,
      snippet: `Snippet for result ${i + 1}`,
      position: i + 1,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchSerper', () => {
  beforeEach(async () => {
    const { resetSerperPacingForTests } = await loadModule();
    resetSerperPacingForTests();
  });

  describe('empty / invalid input', () => {
    it('returns empty results when query is empty', async () => {
      const { searchSerper } = await loadModule();
      const out = await searchSerper({ query: '', apiKey: 'test-key' });
      assert.deepEqual(out.results, []);
    });

    it('returns empty results when apiKey is missing', async () => {
      const { searchSerper } = await loadModule();
      const out = await searchSerper({ query: 'test' });
      assert.deepEqual(out.results, []);
    });
  });

  describe('happy path', () => {
    it('returns results with correct shape', async () => {
      const { searchSerper } = await loadModule();
      const { fn } = createMockFetch({ body: serperResponse(10) });
      const out = await searchSerper({
        query: 'razer viper v3 pro specifications',
        apiKey: 'test-key',
        _fetchFn: fn,
      });
      assert.ok(Array.isArray(out.results), 'results is an array');
      assert.equal(out.results.length, 10);
      for (const row of out.results) {
        assert.ok(row.url, 'has url');
        assert.ok(row.title, 'has title');
        assert.equal(typeof row.snippet, 'string', 'snippet is string');
        assert.equal(row.provider, 'serper', 'provider is serper');
        assert.equal(row.query, 'razer viper v3 pro specifications');
      }
    });

    it('maps link to url', async () => {
      const { searchSerper } = await loadModule();
      const { fn } = createMockFetch({ body: serperResponse(1) });
      const out = await searchSerper({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.equal(out.results[0].url, 'https://example.com/page-1');
    });

    it('sends correct request to Serper API', async () => {
      const { searchSerper } = await loadModule();
      const { fn, calls } = createMockFetch({ body: serperResponse(5) });
      await searchSerper({
        query: 'test query',
        apiKey: 'my-key',
        limit: 20,
        gl: 'us',
        hl: 'en',
        _fetchFn: fn,
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://google.serper.dev/search');
      const opts = calls[0].opts;
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers['X-API-KEY'], 'my-key');
      assert.equal(opts.headers['Content-Type'], 'application/json');
      const body = JSON.parse(opts.body);
      assert.equal(body.q, 'test query');
      assert.equal(body.num, 20);
      assert.equal(body.gl, 'us');
      assert.equal(body.hl, 'en');
    });

    it('proxyKB is always 0', async () => {
      const { searchSerper } = await loadModule();
      const { fn } = createMockFetch({ body: serperResponse(5) });
      const out = await searchSerper({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.equal(out.proxyKB, 0);
    });

    it('respects limit parameter', async () => {
      const { searchSerper } = await loadModule();
      const { fn } = createMockFetch({ body: serperResponse(50) });
      const out = await searchSerper({ query: 'test', apiKey: 'k', limit: 20, _fetchFn: fn });
      assert.equal(out.results.length, 20);
    });
  });

  describe('error handling', () => {
    it('returns empty on 401 (bad key) without retry', async () => {
      const { searchSerper } = await loadModule();
      const { fn, calls } = createMockFetch({ status: 401 });
      const out = await searchSerper({
        query: 'test', apiKey: 'bad-key', _fetchFn: fn, maxRetries: 3,
      });
      assert.deepEqual(out.results, []);
      assert.equal(calls.length, 1, 'no retries on 401');
    });

    it('returns empty on 402 (credits exhausted) without retry', async () => {
      const { searchSerper } = await loadModule();
      const { fn, calls } = createMockFetch({ status: 402 });
      const out = await searchSerper({
        query: 'test', apiKey: 'k', _fetchFn: fn, maxRetries: 3,
      });
      assert.deepEqual(out.results, []);
      assert.equal(calls.length, 1, 'no retries on 402');
    });

    it('retries on 429 (rate limited)', async () => {
      const { searchSerper } = await loadModule();
      let callCount = 0;
      const fn = async (url, opts) => {
        callCount++;
        if (callCount <= 2) return { ok: false, status: 429, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => serperResponse(5) };
      };
      const out = await searchSerper({
        query: 'test', apiKey: 'k', _fetchFn: fn, maxRetries: 3,
        minQueryIntervalMs: 0,
      });
      assert.equal(callCount, 3, 'retried twice then succeeded');
      assert.equal(out.results.length, 5);
    });

    it('returns empty on network error', async () => {
      const { searchSerper } = await loadModule();
      const { fn } = createMockFetch({ shouldThrow: true });
      const out = await searchSerper({
        query: 'test', apiKey: 'k', _fetchFn: fn, maxRetries: 0,
      });
      assert.deepEqual(out.results, []);
    });
  });

  describe('test seams', () => {
    it('exports resetSerperPacingForTests', async () => {
      const mod = await loadModule();
      assert.equal(typeof mod.resetSerperPacingForTests, 'function');
    });
  });
});
