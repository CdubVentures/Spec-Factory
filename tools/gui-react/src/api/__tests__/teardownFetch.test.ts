import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { teardownFetch } from '../teardownFetch.ts';

type FetchCall = {
  url: string;
  init: RequestInit;
};

function createFetchHarness() {
  const fetchCalls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = ((url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return Promise.resolve(new Response());
  }) as typeof globalThis.fetch;

  return {
    fetchCalls,
    replaceFetch(nextFetch: typeof globalThis.fetch) {
      globalThis.fetch = nextFetch;
    },
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

describe('teardownFetch', () => {
  it('issues a keepalive fetch with the serialized payload contract', () => {
    const harness = createFetchHarness();

    try {
      teardownFetch({ url: '/api/v1/settings/runtime', method: 'PUT', body: { a: 1 } });

      strictEqual(harness.fetchCalls.length, 1);
      const [call] = harness.fetchCalls;
      strictEqual(call.url, '/api/v1/settings/runtime');
      strictEqual(call.init.method, 'PUT');
      deepStrictEqual(call.init.headers, { 'Content-Type': 'application/json' });
      strictEqual(call.init.body, JSON.stringify({ a: 1 }));
      strictEqual(call.init.keepalive, true);
    } finally {
      harness.restore();
    }
  });

  it('honors the requested HTTP method', () => {
    const harness = createFetchHarness();

    try {
      teardownFetch({ url: '/api/v1/process/stop', method: 'POST', body: { force: true } });
      strictEqual(harness.fetchCalls.length, 1);
      strictEqual(harness.fetchCalls[0].init.method, 'POST');
    } finally {
      harness.restore();
    }
  });

  it('serializes nested payloads with JSON.stringify', () => {
    const harness = createFetchHarness();

    try {
      const nested = { outer: { inner: [1, 2, 3], flag: true } };
      teardownFetch({ url: '/test', method: 'PUT', body: nested });
      strictEqual(harness.fetchCalls.length, 1);
      strictEqual(harness.fetchCalls[0].init.body, JSON.stringify(nested));
    } finally {
      harness.restore();
    }
  });

  it('serializes null bodies as the string "null"', () => {
    const harness = createFetchHarness();

    try {
      teardownFetch({ url: '/test', method: 'PUT', body: null });
      strictEqual(harness.fetchCalls.length, 1);
      strictEqual(harness.fetchCalls[0].init.body, 'null');
    } finally {
      harness.restore();
    }
  });

  it('swallows fetch transport failures', () => {
    const harness = createFetchHarness();

    try {
      harness.replaceFetch((() => {
        throw new Error('network down');
      }) as typeof globalThis.fetch);
      teardownFetch({ url: '/test', method: 'PUT', body: {} });
    } finally {
      harness.restore();
    }
  });

  it('swallows JSON serialization failures', () => {
    const harness = createFetchHarness();

    try {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      teardownFetch({ url: '/test', method: 'PUT', body: circular });
    } finally {
      harness.restore();
    }
  });

  it('swallows missing fetch implementations', () => {
    const harness = createFetchHarness();

    try {
      harness.replaceFetch(undefined as unknown as typeof globalThis.fetch);
      teardownFetch({ url: '/test', method: 'PUT', body: {} });
    } finally {
      harness.restore();
    }
  });
});
