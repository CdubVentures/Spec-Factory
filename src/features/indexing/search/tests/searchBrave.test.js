import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  return import('../searchBrave.js');
}

function createMockFetch({ status = 200, body = {}, shouldThrow = false } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url: typeof url === 'string' ? url : url.toString(), opts });
    if (shouldThrow) throw new Error('Network error');
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };
  return { fn, calls };
}

function braveResponse(count = 10) {
  return {
    query: { original: 'test', more_results_available: true },
    web: {
      results: Array.from({ length: count }, (_, i) => ({
        title: `Brave Result ${i + 1}`,
        url: `https://example.com/brave-${i + 1}`,
        description: `Description for brave result ${i + 1}`,
        meta_url: { hostname: 'example.com' },
        extra_snippets: [`Extra snippet ${i + 1}`],
        age: '2 days ago',
        page_age: '2025-12-15',
        language: 'en',
      })),
    },
  };
}

describe('searchBrave', () => {
  describe('empty / invalid input', () => {
    it('returns empty when query is empty', async () => {
      const { searchBrave } = await loadModule();
      const out = await searchBrave({ query: '', apiKey: 'k' });
      assert.deepEqual(out, []);
    });

    it('returns empty when apiKey is missing', async () => {
      const { searchBrave } = await loadModule();
      const out = await searchBrave({ query: 'test' });
      assert.deepEqual(out, []);
    });
  });

  describe('happy path', () => {
    it('returns results with correct shape', async () => {
      const { searchBrave } = await loadModule();
      const { fn } = createMockFetch({ body: braveResponse(10) });
      const out = await searchBrave({
        query: 'razer viper v3 pro specs',
        apiKey: 'k',
        _fetchFn: fn,
      });
      assert.equal(out.length, 10);
      for (const row of out) {
        assert.ok(row.url, 'has url');
        assert.ok(row.title, 'has title');
        assert.equal(typeof row.snippet, 'string');
        assert.equal(row.provider, 'brave-api');
      }
    });

    it('maps description to snippet', async () => {
      const { searchBrave } = await loadModule();
      const { fn } = createMockFetch({ body: braveResponse(1) });
      const out = await searchBrave({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.equal(out[0].snippet, 'Description for brave result 1');
    });

    it('includes extraSnippets', async () => {
      const { searchBrave } = await loadModule();
      const { fn } = createMockFetch({ body: braveResponse(1) });
      const out = await searchBrave({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.ok(Array.isArray(out[0].extraSnippets));
      assert.equal(out[0].extraSnippets[0], 'Extra snippet 1');
    });

    it('sends correct request', async () => {
      const { searchBrave } = await loadModule();
      const { fn, calls } = createMockFetch({ body: braveResponse(5) });
      await searchBrave({ query: 'test query', apiKey: 'my-key', count: 20, _fetchFn: fn });
      assert.equal(calls.length, 1);
      const url = calls[0].url;
      assert.ok(url.includes('api.search.brave.com'), 'correct host');
      assert.ok(url.includes('q=test+query') || url.includes('q=test%20query'), 'query param');
      assert.ok(url.includes('count=20'), 'count param');
      const headers = calls[0].opts.headers;
      assert.equal(headers['X-Subscription-Token'], 'my-key');
    });

    it('respects count cap of 20', async () => {
      const { searchBrave } = await loadModule();
      const { fn, calls } = createMockFetch({ body: braveResponse(20) });
      await searchBrave({ query: 'test', apiKey: 'k', count: 50, _fetchFn: fn });
      const url = calls[0].url;
      assert.ok(url.includes('count=20'), 'capped at 20');
    });
  });

  describe('error handling', () => {
    it('returns empty on HTTP error', async () => {
      const { searchBrave } = await loadModule();
      const { fn } = createMockFetch({ status: 429 });
      const out = await searchBrave({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.deepEqual(out, []);
    });

    it('returns empty on network error', async () => {
      const { searchBrave } = await loadModule();
      const { fn } = createMockFetch({ shouldThrow: true });
      const out = await searchBrave({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.deepEqual(out, []);
    });
  });
});
