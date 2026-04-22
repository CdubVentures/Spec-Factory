import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unlockViaApi } from '../brightDataUnlocker.js';

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return handler(calls.length, url, init);
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe('unlockViaApi — contract', () => {
  it('POSTs to api.brightdata.com/request with Bearer auth + zone+url+format', async () => {
    const _fetch = mockFetch(() => jsonResponse(200, { status_code: 200, body: '<html><head><title>Hi</title></head><body>ok</body></html>' }));
    await unlockViaApi({
      url: 'https://example.com/p',
      apiKey: 'KEY_123',
      zone: 'web_unlocker1',
      _fetch,
      _sleep: async () => {},
    });
    assert.equal(_fetch.calls.length, 1);
    assert.equal(_fetch.calls[0].url, 'https://api.brightdata.com/request');
    const init = _fetch.calls[0].init;
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.equal(init.headers['authorization'], 'Bearer KEY_123');
    const body = JSON.parse(init.body);
    assert.equal(body.zone, 'web_unlocker1');
    assert.equal(body.url, 'https://example.com/p');
    assert.equal(body.format, 'json');
    assert.deepEqual(
      body.headers,
      { 'x-unblock-expect': '{"element":"body"}' },
      'must send expect:body in body.headers — bypasses the zone default site-specific selector wait',
    );
  });

  it('happy path: returns target status + html + extracted title', async () => {
    const _fetch = mockFetch(() => jsonResponse(200, {
      status_code: 200,
      body: '<html><head><title>  Corsair M75  </title></head><body><h1>Specs</h1></body></html>',
      url: 'https://www.corsair.com/eu/en/p/m75',
    }));
    const result = await unlockViaApi({
      url: 'https://www.corsair.com/eu/en/p/m75',
      apiKey: 'KEY',
      zone: 'web_unlocker1',
      _fetch,
      _sleep: async () => {},
    });
    assert.equal(result.status, 200);
    assert.match(result.html, /<h1>Specs<\/h1>/);
    assert.equal(result.title, 'Corsair M75');
    assert.equal(result.finalUrl, 'https://www.corsair.com/eu/en/p/m75');
    assert.equal(result.error, '');
    assert.equal(result.attemptsUsed, 1);
  });

  it('surfaces target 404 via status_code (no retry since API call succeeded)', async () => {
    const _fetch = mockFetch(() => jsonResponse(200, {
      status_code: 404,
      body: '<html><body>Not found</body></html>',
    }));
    const result = await unlockViaApi({
      url: 'https://x.com/gone',
      apiKey: 'KEY', zone: 'web_unlocker1',
      _fetch, _sleep: async () => {},
    });
    assert.equal(result.status, 404);
    assert.equal(_fetch.calls.length, 1, 'no retry on target 404 — API succeeded');
  });

  it('401 from API → no retry, returns auth error', async () => {
    const _fetch = mockFetch(() => jsonResponse(401, { error: 'bad key' }));
    const result = await unlockViaApi({
      url: 'https://x.com', apiKey: 'BAD', zone: 'web_unlocker1',
      maxRetries: 3,
      _fetch, _sleep: async () => {},
    });
    assert.equal(result.status, 401);
    assert.equal(result.error, 'brightdata_auth_401');
    assert.equal(_fetch.calls.length, 1, 'auth errors must not retry');
  });

  it('403 from API → no retry, returns auth error', async () => {
    const _fetch = mockFetch(() => jsonResponse(403, { error: 'zone disabled' }));
    const result = await unlockViaApi({
      url: 'https://x.com', apiKey: 'KEY', zone: 'dead_zone',
      maxRetries: 3,
      _fetch, _sleep: async () => {},
    });
    assert.equal(result.status, 403);
    assert.equal(result.error, 'brightdata_auth_403');
    assert.equal(_fetch.calls.length, 1);
  });

  it('500 from API → retries up to maxRetries then gives up', async () => {
    const _fetch = mockFetch(() => jsonResponse(500, { error: 'internal' }));
    const sleepCalls = [];
    const result = await unlockViaApi({
      url: 'https://x.com', apiKey: 'KEY', zone: 'z',
      maxRetries: 3,
      _fetch,
      _sleep: async (ms) => { sleepCalls.push(ms); },
    });
    assert.equal(_fetch.calls.length, 3, 'should retry up to maxRetries');
    assert.equal(sleepCalls.length, 2, 'should sleep between attempts (not after last)');
    assert.equal(result.status, 0);
    assert.equal(result.error, 'brightdata_api_500');
    assert.equal(result.attemptsUsed, 3);
  });

  it('transient 502 then 200 → retries, returns success on second attempt', async () => {
    const _fetch = mockFetch((n) => n === 1
      ? jsonResponse(502, { error: 'bad gateway' })
      : jsonResponse(200, { status_code: 200, body: '<html><body>ok</body></html>' }));
    const result = await unlockViaApi({
      url: 'https://x.com', apiKey: 'KEY', zone: 'z',
      maxRetries: 3,
      _fetch, _sleep: async () => {},
    });
    assert.equal(_fetch.calls.length, 2);
    assert.equal(result.status, 200);
    assert.equal(result.attemptsUsed, 2);
    assert.equal(result.error, '');
  });

  it('fetch throws (network error) → retries and classifies', async () => {
    const _fetch = mockFetch(() => { throw new Error('ECONNRESET'); });
    const result = await unlockViaApi({
      url: 'https://x.com', apiKey: 'KEY', zone: 'z',
      maxRetries: 2,
      _fetch, _sleep: async () => {},
    });
    assert.equal(_fetch.calls.length, 2);
    assert.equal(result.status, 0);
    assert.match(result.error, /brightdata_fetch_error:ECONNRESET/);
  });

  it('abort on timeout → classified as timeout', async () => {
    const _fetch = mockFetch(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const result = await unlockViaApi({
      url: 'https://x.com', apiKey: 'KEY', zone: 'z',
      timeoutMs: 10,
      maxRetries: 1,
      _fetch, _sleep: async () => {},
    });
    assert.equal(result.error, 'brightdata_timeout');
  });

  it('missing required params → immediate error, no fetch call', async () => {
    const _fetch = mockFetch(() => jsonResponse(200, {}));

    const noUrl = await unlockViaApi({ url: '', apiKey: 'K', zone: 'z', _fetch, _sleep: async () => {} });
    assert.equal(noUrl.error, 'missing_required_param');

    const noKey = await unlockViaApi({ url: 'https://x', apiKey: '', zone: 'z', _fetch, _sleep: async () => {} });
    assert.equal(noKey.error, 'missing_required_param');

    const noZone = await unlockViaApi({ url: 'https://x', apiKey: 'K', zone: '', _fetch, _sleep: async () => {} });
    assert.equal(noZone.error, 'missing_required_param');

    assert.equal(_fetch.calls.length, 0, 'no fetch call on missing params');
  });

  it('empty body from API → classified as empty', async () => {
    const _fetch = mockFetch(() => jsonResponse(200, { status_code: 200, body: '' }));
    const result = await unlockViaApi({
      url: 'https://x.com', apiKey: 'K', zone: 'z',
      _fetch, _sleep: async () => {},
    });
    assert.equal(result.html, '');
    assert.equal(result.status, 200);
    // Callers decide if status=200/html='' is a block; unlocker just reports it.
  });
});
