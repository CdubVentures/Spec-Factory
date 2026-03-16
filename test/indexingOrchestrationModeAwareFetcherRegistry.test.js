import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const INDEXING_ORCHESTRATION_ENTRY = path.resolve('src/features/indexing/orchestration/index.js');

test('createModeAwareFetcherRegistry reuses the initial fetcher, lazy-starts mode fetchers, and stops each started fetcher once', async () => {
  const feature = await import(pathToFileURL(INDEXING_ORCHESTRATION_ENTRY).href);
  const createCalls = [];
  const startCalls = [];
  const stopCalls = [];
  const fetchCalls = [];

  const initialFetcher = {
    async fetch(source) {
      fetchCalls.push({ mode: 'crawlee', url: source.url });
      return { ok: true, source: 'crawlee' };
    },
    async stop() {
      stopCalls.push('crawlee');
    },
  };

  const registry = feature.createModeAwareFetcherRegistry({
    initialFetcher,
    initialMode: 'crawlee',
    createFetcherForModeFn: (mode) => {
      createCalls.push(mode);
      return {
        async start() {
          startCalls.push(mode);
        },
        async fetch(source) {
          fetchCalls.push({ mode, url: source.url });
          return { ok: true, source: mode };
        },
        async stop() {
          stopCalls.push(mode);
        },
      };
    },
  });

  const crawleeResult = await registry.fetchWithMode({ url: 'https://example.com/a' }, 'crawlee');
  const playwrightResult = await registry.fetchWithMode({ url: 'https://example.com/b' }, 'playwright');
  const playwrightRepeatResult = await registry.fetchWithMode({ url: 'https://example.com/c' }, 'playwright');
  const httpResult = await registry.fetchWithMode({ url: 'https://example.com/d' }, 'http');

  await registry.stopAll();

  assert.deepEqual(crawleeResult, { ok: true, source: 'crawlee' });
  assert.deepEqual(playwrightResult, { ok: true, source: 'playwright' });
  assert.deepEqual(playwrightRepeatResult, { ok: true, source: 'playwright' });
  assert.deepEqual(httpResult, { ok: true, source: 'http' });
  assert.deepEqual(createCalls, ['playwright', 'http']);
  assert.deepEqual(startCalls, ['playwright', 'http']);
  assert.deepEqual(fetchCalls, [
    { mode: 'crawlee', url: 'https://example.com/a' },
    { mode: 'playwright', url: 'https://example.com/b' },
    { mode: 'playwright', url: 'https://example.com/c' },
    { mode: 'http', url: 'https://example.com/d' },
  ]);
  assert.deepEqual(stopCalls, ['crawlee', 'playwright', 'http']);
});

test('createModeAwareFetcherRegistry falls back to the initial mode when the requested mode is empty', async () => {
  const feature = await import(pathToFileURL(INDEXING_ORCHESTRATION_ENTRY).href);
  const fetchCalls = [];

  const registry = feature.createModeAwareFetcherRegistry({
    initialFetcher: {
      async fetch(source) {
        fetchCalls.push(source.url);
        return { ok: true, source: 'initial' };
      },
      async stop() {},
    },
    initialMode: 'http',
    createFetcherForModeFn: () => {
      throw new Error('should not create alternate fetcher');
    },
  });

  const result = await registry.fetchWithMode({ url: 'https://example.com/initial' }, '');

  assert.deepEqual(result, { ok: true, source: 'initial' });
  assert.deepEqual(fetchCalls, ['https://example.com/initial']);
});

test('createModeAwareFetcherRegistry throws when an alternate mode cannot be created', async () => {
  const feature = await import(pathToFileURL(INDEXING_ORCHESTRATION_ENTRY).href);

  const registry = feature.createModeAwareFetcherRegistry({
    initialFetcher: {
      async fetch() {
        return { ok: true };
      },
      async stop() {},
    },
    initialMode: 'http',
    createFetcherForModeFn: () => null,
  });

  await assert.rejects(
    registry.fetchWithMode({ url: 'https://example.com/missing' }, 'playwright'),
    /unsupported fetcher mode/i,
  );
});
