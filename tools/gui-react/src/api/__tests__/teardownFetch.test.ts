import { describe, it, beforeEach, afterEach } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { teardownFetch } from '../teardownFetch.ts';

/* ------------------------------------------------------------------ */
/*  Test harness: capture fetch calls                                   */
/* ------------------------------------------------------------------ */

let fetchCalls: { url: string; init: RequestInit }[];
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return Promise.resolve(new Response());
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/* ------------------------------------------------------------------ */
/*  teardownFetch                                                       */
/* ------------------------------------------------------------------ */

describe('teardownFetch', () => {

  it('calls fetch with correct url, PUT method, headers, serialized body, and keepalive', () => {
    teardownFetch({ url: '/api/v1/settings/runtime', method: 'PUT', body: { a: 1 } });
    strictEqual(fetchCalls.length, 1);
    const call = fetchCalls[0];
    strictEqual(call.url, '/api/v1/settings/runtime');
    strictEqual(call.init.method, 'PUT');
    deepStrictEqual(call.init.headers, { 'Content-Type': 'application/json' });
    strictEqual(call.init.body, JSON.stringify({ a: 1 }));
    strictEqual(call.init.keepalive, true);
  });

  it('calls fetch with POST method when specified', () => {
    teardownFetch({ url: '/api/v1/process/stop', method: 'POST', body: { force: true } });
    strictEqual(fetchCalls.length, 1);
    strictEqual(fetchCalls[0].init.method, 'POST');
  });

  it('serializes nested body correctly via JSON.stringify', () => {
    const nested = { outer: { inner: [1, 2, 3], flag: true } };
    teardownFetch({ url: '/test', method: 'PUT', body: nested });
    strictEqual(fetchCalls.length, 1);
    strictEqual(fetchCalls[0].init.body, JSON.stringify(nested));
  });

  it('serializes null body as the string "null"', () => {
    teardownFetch({ url: '/test', method: 'PUT', body: null });
    strictEqual(fetchCalls.length, 1);
    strictEqual(fetchCalls[0].init.body, 'null');
  });

  it('does not throw when fetch throws', () => {
    globalThis.fetch = (() => { throw new Error('network down'); }) as typeof globalThis.fetch;
    // Must not throw
    teardownFetch({ url: '/test', method: 'PUT', body: {} });
  });

  it('does not throw when JSON.stringify throws (circular ref)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // Must not throw
    teardownFetch({ url: '/test', method: 'PUT', body: circular });
  });

  it('does not throw when fetch is undefined', () => {
    globalThis.fetch = undefined as unknown as typeof globalThis.fetch;
    // Must not throw
    teardownFetch({ url: '/test', method: 'PUT', body: {} });
  });
});
