/**
 * Boundary test matrix for batchHeadCheck — deterministic URL verification.
 *
 * Contract:
 *   batchHeadCheck(urls, { timeoutMs?, cache? }) →
 *     Promise<Map<url, { http_status: number, verified_at: string|null, error?: string }>>
 *
 * Semantics:
 *   - http_status in [200, 299]  → valid source
 *   - http_status in [400, 599]  → bad source (404, 500, etc.)
 *   - http_status === 0          → unknown (network error / timeout / invalid URL)
 *   - HEAD returning 405 retries as GET
 *   - Redirects followed transparently
 *   - Cache Map, if provided, dedupes across calls AND is mutated in place
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { batchHeadCheck } from '../urlHeadCheck.js';

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method || 'GET', signal: opts?.signal || null });
    return handler(String(url), opts || {});
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function mkResponse(status, { headers = {} } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Map(Object.entries(headers)) };
}

describe('batchHeadCheck', () => {
  let fetchStub;

  afterEach(() => {
    fetchStub?.restore?.();
    fetchStub = null;
  });

  it('returns empty Map for empty input', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const result = await batchHeadCheck([]);
    assert.ok(result instanceof Map);
    assert.equal(result.size, 0);
    assert.equal(fetchStub.calls.length, 0);
  });

  it('returns empty Map for null input', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const result = await batchHeadCheck(null);
    assert.equal(result.size, 0);
  });

  it('200 OK → http_status: 200, verified_at set, no error', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const result = await batchHeadCheck(['https://example.com/a']);
    const entry = result.get('https://example.com/a');
    assert.equal(entry.http_status, 200);
    assert.ok(entry.verified_at);
    assert.ok(!entry.error);
  });

  it('sends HEAD method by default', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    await batchHeadCheck(['https://example.com/a']);
    assert.equal(fetchStub.calls[0].method, 'HEAD');
  });

  it('404 → http_status: 404, still verified (not an error)', async () => {
    fetchStub = stubFetch(() => mkResponse(404));
    const result = await batchHeadCheck(['https://example.com/404']);
    const entry = result.get('https://example.com/404');
    assert.equal(entry.http_status, 404);
    assert.ok(entry.verified_at);
    assert.ok(!entry.error);
  });

  it('5xx → http_status: 500', async () => {
    fetchStub = stubFetch(() => mkResponse(500));
    const result = await batchHeadCheck(['https://example.com/bad']);
    assert.equal(result.get('https://example.com/bad').http_status, 500);
  });

  it('follows redirects transparently (fetch redirect=follow)', async () => {
    // Simulate: underlying fetch returns 200 after the runtime followed the redirect.
    // Verify we pass redirect: 'follow' and trust the final status.
    fetchStub = stubFetch((url, opts) => {
      assert.equal(opts.redirect, 'follow');
      return mkResponse(200);
    });
    const result = await batchHeadCheck(['https://example.com/redirect']);
    assert.equal(result.get('https://example.com/redirect').http_status, 200);
  });

  it('405 on HEAD retries with GET', async () => {
    let headCalls = 0;
    let getCalls = 0;
    fetchStub = stubFetch((url, opts) => {
      if (opts.method === 'HEAD') { headCalls++; return mkResponse(405); }
      if (opts.method === 'GET') { getCalls++; return mkResponse(200); }
      throw new Error('unexpected method');
    });
    const result = await batchHeadCheck(['https://example.com/head-blocked']);
    assert.equal(result.get('https://example.com/head-blocked').http_status, 200);
    assert.equal(headCalls, 1);
    assert.equal(getCalls, 1);
  });

  it('HEAD throws but GET succeeds (CDN HEAD quirk) → uses GET status', async () => {
    // WHY: Observed on corsair.com — node/undici HEAD throws "fetch failed"
    // but GET returns 200. Must fall back to GET on any HEAD failure.
    let getCalls = 0;
    fetchStub = stubFetch((url, opts) => {
      if (opts.method === 'HEAD') throw new TypeError('fetch failed');
      if (opts.method === 'GET') { getCalls++; return mkResponse(200); }
      throw new Error('unexpected method');
    });
    const result = await batchHeadCheck(['https://example.com/head-quirk']);
    assert.equal(result.get('https://example.com/head-quirk').http_status, 200);
    assert.equal(getCalls, 1);
    assert.ok(!result.get('https://example.com/head-quirk').error);
  });

  it('HEAD throws, GET returns 404 → uses 404 (real dead page)', async () => {
    fetchStub = stubFetch((url, opts) => {
      if (opts.method === 'HEAD') throw new TypeError('fetch failed');
      if (opts.method === 'GET') return mkResponse(404);
      throw new Error('unexpected method');
    });
    const result = await batchHeadCheck(['https://example.com/real-404']);
    assert.equal(result.get('https://example.com/real-404').http_status, 404);
  });

  it('fetch throws (network error) → http_status: 0, error set', async () => {
    fetchStub = stubFetch(() => { throw new TypeError('fetch failed'); });
    const result = await batchHeadCheck(['https://example.com/dead']);
    const entry = result.get('https://example.com/dead');
    assert.equal(entry.http_status, 0);
    assert.ok(entry.error);
  });

  it('AbortError from timeout → http_status: 0, error: "timeout"', async () => {
    fetchStub = stubFetch(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });
    const result = await batchHeadCheck(['https://example.com/slow'], { timeoutMs: 10 });
    const entry = result.get('https://example.com/slow');
    assert.equal(entry.http_status, 0);
    assert.equal(entry.error, 'timeout');
  });

  it('invalid URL string → http_status: 0, error: "invalid_url", no fetch', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const result = await batchHeadCheck(['not a url']);
    const entry = result.get('not a url');
    assert.equal(entry.http_status, 0);
    assert.equal(entry.error, 'invalid_url');
    assert.equal(fetchStub.calls.length, 0);
  });

  it('empty / null URL entries are skipped (not in map, no fetch)', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const result = await batchHeadCheck(['', null, undefined, 'https://example.com/a']);
    assert.equal(result.size, 1);
    assert.ok(result.has('https://example.com/a'));
    assert.equal(fetchStub.calls.length, 1);
  });

  it('multiple URLs fire in parallel (all resolved)', async () => {
    fetchStub = stubFetch((url) => {
      if (url.endsWith('/a')) return mkResponse(200);
      if (url.endsWith('/b')) return mkResponse(404);
      if (url.endsWith('/c')) return mkResponse(500);
      return mkResponse(0);
    });
    const result = await batchHeadCheck([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
    assert.equal(result.size, 3);
    assert.equal(result.get('https://example.com/a').http_status, 200);
    assert.equal(result.get('https://example.com/b').http_status, 404);
    assert.equal(result.get('https://example.com/c').http_status, 500);
  });

  it('duplicate URLs in input deduplicate (single fetch)', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const result = await batchHeadCheck([
      'https://example.com/dup',
      'https://example.com/dup',
      'https://example.com/dup',
    ]);
    assert.equal(result.size, 1);
    assert.equal(fetchStub.calls.length, 1);
  });

  it('cache hit: previously-seen URL skips fetch and returns cached entry', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const cache = new Map();
    cache.set('https://example.com/cached', { http_status: 418, verified_at: '2020-01-01T00:00:00.000Z' });

    const result = await batchHeadCheck(['https://example.com/cached'], { cache });

    assert.equal(result.get('https://example.com/cached').http_status, 418);
    assert.equal(fetchStub.calls.length, 0);
  });

  it('cache write: fetched URL is stored in the provided cache', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const cache = new Map();

    await batchHeadCheck(['https://example.com/write'], { cache });

    assert.ok(cache.has('https://example.com/write'));
    assert.equal(cache.get('https://example.com/write').http_status, 200);
  });

  it('cache miss + cache write across two calls → second call hits cache', async () => {
    fetchStub = stubFetch(() => mkResponse(200));
    const cache = new Map();

    await batchHeadCheck(['https://example.com/x'], { cache });
    await batchHeadCheck(['https://example.com/x'], { cache });

    assert.equal(fetchStub.calls.length, 1);
  });

  it('passes an AbortSignal to fetch (enforces timeout)', async () => {
    fetchStub = stubFetch((url, opts) => {
      assert.ok(opts.signal, 'expected an AbortSignal');
      return mkResponse(200);
    });
    await batchHeadCheck(['https://example.com/a'], { timeoutMs: 100 });
  });

  it('different URLs do NOT share cache entries', async () => {
    fetchStub = stubFetch((url) => mkResponse(url.endsWith('/a') ? 200 : 404));
    const cache = new Map();
    await batchHeadCheck(['https://example.com/a', 'https://example.com/b'], { cache });
    assert.equal(cache.get('https://example.com/a').http_status, 200);
    assert.equal(cache.get('https://example.com/b').http_status, 404);
  });
});
