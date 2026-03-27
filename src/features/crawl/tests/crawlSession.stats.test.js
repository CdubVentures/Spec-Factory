import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';

describe('crawlSession.getStats()', () => {
  it('returns null when using _crawlerFactory (no real Crawlee stats)', () => {
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      _crawlerFactory(config) {
        return { async run() {}, async teardown() {} };
      },
    });

    const stats = session.getStats();
    assert.equal(stats, null, 'factory crawlers have no stats');
  });

  it('returns null before start() is called', () => {
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      _crawlerFactory(config) {
        return { async run() {}, async teardown() {} };
      },
    });

    // Don't call start — crawler is null
    const stats = session.getStats();
    assert.equal(stats, null);
  });

  it('returns stats shape when crawler has a stats property', async () => {
    const fakeStats = {
      state: {
        requestsWithStatusCode: { '200': 5, '403': 2 },
      },
      requestRetryHistogram: [4, 2, 1],
      errorTracker: {
        getMostPopularErrors(n) {
          return [[3, ['Error', 'timeout']], [1, ['Error', 'blocked']]].slice(0, n);
        },
      },
      errorTrackerRetry: {
        getMostPopularErrors(n) {
          return [[2, ['Error', 'retry-err']]].slice(0, n);
        },
      },
      calculate() {
        return {
          requestAvgFinishedDurationMillis: 1234.5,
          requestAvgFailedDurationMillis: 8765.4,
        };
      },
    };

    const session = createCrawlSession({
      settings: {},
      plugins: [],
      _crawlerFactory(config) {
        const crawler = {
          stats: fakeStats,
          async run() {},
          async teardown() {},
        };
        return crawler;
      },
    });

    await session.start();
    const stats = session.getStats();

    assert.ok(stats, 'stats should not be null');
    assert.deepEqual(stats.status_codes, { '200': 5, '403': 2 });
    assert.deepEqual(stats.retry_histogram, [4, 2, 1]);
    assert.equal(stats.avg_ok_ms, 1235, 'rounded to integer');
    assert.equal(stats.avg_fail_ms, 8765, 'rounded to integer');
    assert.equal(stats.top_errors.length, 2);
    assert.deepEqual(stats.top_errors[0], [3, ['Error', 'timeout']]);
  });

  it('handles Infinity avg durations (no requests yet)', async () => {
    const fakeStats = {
      state: { requestsWithStatusCode: {} },
      requestRetryHistogram: [],
      errorTracker: { getMostPopularErrors() { return []; } },
      errorTrackerRetry: { getMostPopularErrors() { return []; } },
      calculate() {
        return {
          requestAvgFinishedDurationMillis: Infinity,
          requestAvgFailedDurationMillis: Infinity,
        };
      },
    };

    const session = createCrawlSession({
      settings: {},
      plugins: [],
      _crawlerFactory(config) {
        return { stats: fakeStats, async run() {}, async teardown() {} };
      },
    });

    await session.start();
    const stats = session.getStats();

    assert.equal(stats.avg_ok_ms, 0, 'Infinity should become 0');
    assert.equal(stats.avg_fail_ms, 0, 'Infinity should become 0');
  });
});
