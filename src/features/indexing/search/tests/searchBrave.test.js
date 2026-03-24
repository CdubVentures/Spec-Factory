import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBraveResponse,
  createFetchDouble,
} from './factories/searchProviderTestDoubles.js';

async function loadModule() {
  return import('../searchBrave.js');
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
      const { fn } = createFetchDouble({ body: buildBraveResponse(10) });
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
      const { fn } = createFetchDouble({ body: buildBraveResponse(1) });
      const out = await searchBrave({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.equal(out[0].snippet, 'Description for brave result 1');
    });

    it('includes extraSnippets', async () => {
      const { searchBrave } = await loadModule();
      const { fn } = createFetchDouble({ body: buildBraveResponse(1) });
      const out = await searchBrave({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.ok(Array.isArray(out[0].extraSnippets));
      assert.equal(out[0].extraSnippets[0], 'Extra snippet 1');
    });

    it('sends correct request', async () => {
      const { searchBrave } = await loadModule();
      const { fn, calls } = createFetchDouble({ body: buildBraveResponse(5) });
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
      const { fn, calls } = createFetchDouble({ body: buildBraveResponse(20) });
      await searchBrave({ query: 'test', apiKey: 'k', count: 50, _fetchFn: fn });
      const url = calls[0].url;
      assert.ok(url.includes('count=20'), 'capped at 20');
    });
  });

  describe('error handling', () => {
    it('returns empty on HTTP error', async () => {
      const { searchBrave } = await loadModule();
      const { fn } = createFetchDouble({ status: 429 });
      const out = await searchBrave({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.deepEqual(out, []);
    });

    it('returns empty on network error', async () => {
      const { searchBrave } = await loadModule();
      const { fn } = createFetchDouble({ shouldThrow: true });
      const out = await searchBrave({ query: 'test', apiKey: 'k', _fetchFn: fn });
      assert.deepEqual(out, []);
    });
  });
});
