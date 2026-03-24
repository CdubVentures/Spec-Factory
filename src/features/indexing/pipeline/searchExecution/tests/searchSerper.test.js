import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSerperResponse,
  createFetchDouble,
  createPacerDouble,
} from './factories/searchProviderTestDoubles.js';

async function loadModule() {
  return import('../searchSerper.js');
}

describe('searchSerper', () => {
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
      const { fn } = createFetchDouble({ body: buildSerperResponse(10) });
      const { pacer } = createPacerDouble();
      const out = await searchSerper({
        query: 'razer viper v3 pro specifications',
        apiKey: 'test-key',
        _fetchFn: fn,
        _pacer: pacer,
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
      const { fn } = createFetchDouble({ body: buildSerperResponse(1) });
      const { pacer } = createPacerDouble();
      const out = await searchSerper({ query: 'test', apiKey: 'k', _fetchFn: fn, _pacer: pacer });
      assert.equal(out.results[0].url, 'https://example.com/page-1');
    });

    it('sends correct request to Serper API', async () => {
      const { searchSerper } = await loadModule();
      const { fn, calls } = createFetchDouble({ body: buildSerperResponse(5) });
      const { pacer } = createPacerDouble();
      await searchSerper({
        query: 'test query',
        apiKey: 'my-key',
        limit: 10,
        gl: 'us',
        hl: 'en',
        _fetchFn: fn,
        _pacer: pacer,
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://google.serper.dev/search');
      const opts = calls[0].opts;
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers['X-API-KEY'], 'my-key');
      assert.equal(opts.headers['Content-Type'], 'application/json');
      const body = JSON.parse(opts.body);
      assert.equal(body.q, 'test query');
      assert.equal(body.num, 10);
      assert.equal(body.gl, 'us');
      assert.equal(body.hl, 'en');
    });

    it('proxyKB is always 0', async () => {
      const { searchSerper } = await loadModule();
      const { fn } = createFetchDouble({ body: buildSerperResponse(5) });
      const { pacer } = createPacerDouble();
      const out = await searchSerper({ query: 'test', apiKey: 'k', _fetchFn: fn, _pacer: pacer });
      assert.equal(out.proxyKB, 0);
    });

    it('respects limit parameter (capped at 10)', async () => {
      const { searchSerper } = await loadModule();
      const { fn } = createFetchDouble({ body: buildSerperResponse(50) });
      const { pacer } = createPacerDouble();
      // WHY: Serper hard caps at 10 organic results regardless of num param
      const out = await searchSerper({ query: 'test', apiKey: 'k', limit: 10, _fetchFn: fn, _pacer: pacer });
      assert.equal(out.results.length, 10);
    });
  });

  describe('error handling', () => {
    it('returns empty on 401 (bad key) without retry', async () => {
      const { searchSerper } = await loadModule();
      const { fn, calls } = createFetchDouble({ status: 401 });
      const { pacer } = createPacerDouble();
      const out = await searchSerper({
        query: 'test', apiKey: 'bad-key', _fetchFn: fn, _pacer: pacer, maxRetries: 3,
      });
      assert.deepEqual(out.results, []);
      assert.equal(calls.length, 1, 'no retries on 401');
    });

    it('returns empty on 402 (credits exhausted) without retry', async () => {
      const { searchSerper } = await loadModule();
      const { fn, calls } = createFetchDouble({ status: 402 });
      const { pacer } = createPacerDouble();
      const out = await searchSerper({
        query: 'test', apiKey: 'k', _fetchFn: fn, _pacer: pacer, maxRetries: 3,
      });
      assert.deepEqual(out.results, []);
      assert.equal(calls.length, 1, 'no retries on 402');
    });

    it('retries on 429 (rate limited)', async () => {
      const timeoutMock = mock.method(globalThis, 'setTimeout', (callback, ms = 0) => {
        if (Number(ms) < 5000) {
          queueMicrotask(() => callback());
        }
        return 1;
      });
      const clearTimeoutMock = mock.method(globalThis, 'clearTimeout', () => {});

      try {
        const { searchSerper } = await loadModule();
        const { pacer } = createPacerDouble();
        const { fn, calls } = createFetchDouble({
          sequence: [
            { status: 429, body: {} },
            { status: 429, body: {} },
            { status: 200, body: buildSerperResponse(5) },
          ],
        });

        const searchPromise = searchSerper({
          query: 'test',
          apiKey: 'k',
          _fetchFn: fn,
          _pacer: pacer,
          maxRetries: 3,
          minQueryIntervalMs: 0,
        });
        const out = await searchPromise;

        assert.equal(calls.length, 3, 'retried twice then succeeded');
        assert.equal(out.results.length, 5);
      } finally {
        timeoutMock.mock.restore();
        clearTimeoutMock.mock.restore();
      }
    });

    it('returns empty on network error', async () => {
      const { searchSerper } = await loadModule();
      const { fn } = createFetchDouble({ shouldThrow: true });
      const { pacer } = createPacerDouble();
      const out = await searchSerper({
        query: 'test', apiKey: 'k', _fetchFn: fn, _pacer: pacer, maxRetries: 0,
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
