import test from 'node:test';
import assert from 'node:assert/strict';

import { executeSearchQueries } from '../executeSearchQueries.js';
import {
  makeConfig,
  makeExecutionArgs,
  makeProviderState,
} from './helpers/discoverySearchExecutionHarness.js';

// ---------------------------------------------------------------------------
// Helpers — concurrency-tracking mock provider
// ---------------------------------------------------------------------------

function createConcurrencyTrackingProvider(resultsByQuery = {}) {
  let concurrentCount = 0;
  let maxConcurrent = 0;
  const callOrder = [];

  const provider = async ({ query }) => {
    concurrentCount++;
    maxConcurrent = Math.max(maxConcurrent, concurrentCount);
    callOrder.push(query);
    // Small delay so concurrent calls overlap
    await new Promise((r) => setTimeout(r, 15));
    concurrentCount--;
    const results = resultsByQuery[query] || [
      { url: `https://example.com/${encodeURIComponent(query)}`, title: query, snippet: '', provider: 'serper' },
    ];
    return results;
  };

  return { provider, stats: () => ({ maxConcurrent, callOrder }) };
}

function serperProviderState() {
  return makeProviderState({
    provider: 'serper',
    internet_ready: true,
    serper_ready: true,
    active_providers: ['serper'],
  });
}

function serperConfig(overrides = {}) {
  return makeConfig({
    serperApiKey: 'test-key',
    serperEnabled: true,
    searchEngines: 'serper',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 1. Burst off (default) — sequential
// ---------------------------------------------------------------------------

test('burst off: queries execute sequentially (maxConcurrent === 1)', async () => {
  const { provider, stats } = createConcurrencyTrackingProvider();

  await executeSearchQueries(makeExecutionArgs({
    config: serperConfig({ serperBurstEnabled: false }),
    queries: ['q1', 'q2', 'q3'],
    executionQueryLimit: 3,
    providerState: serperProviderState(),
    _runSearchProvidersFn: provider,
  }));

  assert.equal(stats().maxConcurrent, 1, 'queries should run one at a time when burst is off');
});

// ---------------------------------------------------------------------------
// 2. Burst on + serper — concurrent
// ---------------------------------------------------------------------------

test('burst on + serper active: all queries fire concurrently', async () => {
  const { provider, stats } = createConcurrencyTrackingProvider();

  await executeSearchQueries(makeExecutionArgs({
    config: serperConfig({ serperBurstEnabled: true }),
    queries: ['q1', 'q2', 'q3'],
    executionQueryLimit: 3,
    providerState: serperProviderState(),
    _runSearchProvidersFn: provider,
  }));

  assert.equal(stats().maxConcurrent, 3, 'all 3 queries should be in-flight simultaneously');
});

// ---------------------------------------------------------------------------
// 3. Burst on + non-serper provider — still sequential
// ---------------------------------------------------------------------------

test('burst on + non-serper provider: queries still execute sequentially', async () => {
  const { provider, stats } = createConcurrencyTrackingProvider();

  await executeSearchQueries(makeExecutionArgs({
    config: serperConfig({ serperBurstEnabled: true }),
    queries: ['q1', 'q2', 'q3'],
    executionQueryLimit: 3,
    providerState: makeProviderState({
      provider: 'google',
      internet_ready: true,
      serper_ready: false,
      active_providers: ['google'],
    }),
    _runSearchProvidersFn: provider,
  }));

  assert.equal(stats().maxConcurrent, 1, 'non-serper provider should remain sequential even with burst on');
});

// ---------------------------------------------------------------------------
// 4. Burst respects executionQueryLimit
// ---------------------------------------------------------------------------

test('burst respects executionQueryLimit: only capped queries run, all concurrent', async () => {
  const { provider, stats } = createConcurrencyTrackingProvider();

  const result = await executeSearchQueries(makeExecutionArgs({
    config: serperConfig({ serperBurstEnabled: true }),
    queries: ['q1', 'q2', 'q3', 'q4', 'q5'],
    executionQueryLimit: 3,
    providerState: serperProviderState(),
    _runSearchProvidersFn: provider,
  }));

  assert.equal(stats().callOrder.length, 3, 'only 3 queries should execute');
  assert.equal(stats().maxConcurrent, 3, 'all 3 capped queries should be concurrent');
  assert.equal(result.searchAttempts.length, 3);
});

// ---------------------------------------------------------------------------
// 5. Burst with 1 query — same as non-burst
// ---------------------------------------------------------------------------

test('burst with 1 query: behaves identically to non-burst', async () => {
  const { provider, stats } = createConcurrencyTrackingProvider();

  const result = await executeSearchQueries(makeExecutionArgs({
    config: serperConfig({ serperBurstEnabled: true }),
    queries: ['single'],
    executionQueryLimit: 1,
    providerState: serperProviderState(),
    _runSearchProvidersFn: provider,
  }));

  assert.equal(stats().maxConcurrent, 1);
  assert.equal(result.searchResults.length, 1);
  assert.equal(result.searchAttempts.length, 1);
});

// ---------------------------------------------------------------------------
// 6. Burst with 0 queries — empty
// ---------------------------------------------------------------------------

test('burst with 0 queries: returns empty results', async () => {
  const { provider } = createConcurrencyTrackingProvider();

  const result = await executeSearchQueries(makeExecutionArgs({
    config: serperConfig({ serperBurstEnabled: true }),
    queries: [],
    executionQueryLimit: 0,
    providerState: serperProviderState(),
    _runSearchProvidersFn: provider,
  }));

  assert.deepStrictEqual(result.searchResults, []);
  assert.deepStrictEqual(result.searchAttempts, []);
  assert.deepStrictEqual(result.searchJournal, []);
});

// ---------------------------------------------------------------------------
// 7. Burst preserves query order in results
// ---------------------------------------------------------------------------

test('burst preserves query order despite varying response times', async () => {
  const delays = { fast: 5, medium: 30, slow: 50 };
  let concurrentCount = 0;
  let maxConcurrent = 0;

  const provider = async ({ query }) => {
    concurrentCount++;
    maxConcurrent = Math.max(maxConcurrent, concurrentCount);
    await new Promise((r) => setTimeout(r, delays[query] || 10));
    concurrentCount--;
    return [{ url: `https://example.com/${query}`, title: query, snippet: '', provider: 'serper' }];
  };

  const result = await executeSearchQueries(makeExecutionArgs({
    config: serperConfig({ serperBurstEnabled: true }),
    queries: ['slow', 'fast', 'medium'],
    executionQueryLimit: 3,
    providerState: serperProviderState(),
    _runSearchProvidersFn: provider,
  }));

  assert.equal(maxConcurrent, 3, 'all queries should overlap');
  // runWithConcurrency preserves index order regardless of completion order
  assert.equal(result.searchAttempts[0].query, 'slow');
  assert.equal(result.searchAttempts[1].query, 'fast');
  assert.equal(result.searchAttempts[2].query, 'medium');
});

// ---------------------------------------------------------------------------
// 8. Burst accumulates all results correctly
// ---------------------------------------------------------------------------

test('burst accumulates all results from all concurrent queries', async () => {
  const resultsByQuery = {
    q1: [
      { url: 'https://a.com/1', title: 'A1', snippet: '', provider: 'serper' },
      { url: 'https://a.com/2', title: 'A2', snippet: '', provider: 'serper' },
    ],
    q2: [
      { url: 'https://b.com/1', title: 'B1', snippet: '', provider: 'serper' },
      { url: 'https://b.com/2', title: 'B2', snippet: '', provider: 'serper' },
    ],
    q3: [
      { url: 'https://c.com/1', title: 'C1', snippet: '', provider: 'serper' },
      { url: 'https://c.com/2', title: 'C2', snippet: '', provider: 'serper' },
    ],
  };
  const { provider } = createConcurrencyTrackingProvider(resultsByQuery);

  const result = await executeSearchQueries(makeExecutionArgs({
    config: serperConfig({ serperBurstEnabled: true }),
    queries: ['q1', 'q2', 'q3'],
    executionQueryLimit: 3,
    providerState: serperProviderState(),
    _runSearchProvidersFn: provider,
  }));

  assert.equal(result.searchResults.length, 6, 'all 6 results (2 per query) should accumulate');
  assert.equal(result.searchAttempts.length, 3);
  assert.equal(result.searchJournal.length, 3);

  const urls = result.searchResults.map((r) => r.url);
  assert.ok(urls.includes('https://a.com/1'));
  assert.ok(urls.includes('https://b.com/2'));
  assert.ok(urls.includes('https://c.com/1'));
});
