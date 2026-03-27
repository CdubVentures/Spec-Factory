import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';
import { createLoggerSpy } from './factories/crawlTestDoubles.js';

describe('crawlSession runFetchPlan emits crawler_stats event', () => {
  it('emits crawler_stats after batch when crawler has stats', async () => {
    const fakeStats = {
      state: { requestsWithStatusCode: { '200': 1 } },
      requestRetryHistogram: [1],
      errorTracker: { getMostPopularErrors() { return []; } },
      errorTrackerRetry: { getMostPopularErrors() { return []; } },
      calculate() {
        return {
          requestAvgFinishedDurationMillis: 500,
          requestAvgFailedDurationMillis: 0,
        };
      },
    };

    const { logger, infoCalls } = createLoggerSpy();

    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory(config) {
        return {
          stats: fakeStats,
          async run(requests = []) {
            for (const request of requests) {
              const page = {
                async content() { return '<html><body>OK</body></html>'; },
                url() { return request.url; },
                async title() { return 'T'; },
                viewportSize() { return { width: 1280, height: 720 }; },
                async screenshot() { return Buffer.from('x'); },
                async addInitScript() {},
                async evaluate() { return 0; },
                async waitForTimeout() {},
              };
              await config.requestHandler({
                page,
                request: { url: request.url, uniqueKey: request.uniqueKey, userData: {} },
                response: { status: () => 200 },
              });
            }
          },
          async teardown() {},
        };
      },
    });

    await session.start();

    await session.runFetchPlan({
      orderedSources: [{ url: 'https://example.com/1' }],
      workerIdMap: new Map(),
    });

    const statsEvents = infoCalls.filter((c) => c.event === 'crawler_stats');
    assert.equal(statsEvents.length, 1, 'one crawler_stats event per batch');
    assert.ok(statsEvents[0].status_codes, 'has status_codes');
    assert.deepEqual(statsEvents[0].status_codes, { '200': 1 });
    assert.deepEqual(statsEvents[0].retry_histogram, [1]);
    assert.equal(statsEvents[0].avg_ok_ms, 500);
  });

  it('does NOT emit crawler_stats when factory crawler has no stats', async () => {
    const { logger, infoCalls } = createLoggerSpy();

    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory(config) {
        return {
          // No stats property
          async run(requests = []) {
            for (const request of requests) {
              const page = {
                async content() { return '<html><body>OK</body></html>'; },
                url() { return request.url; },
                async title() { return 'T'; },
                viewportSize() { return { width: 1280, height: 720 }; },
                async screenshot() { return Buffer.from('x'); },
                async addInitScript() {},
                async evaluate() { return 0; },
                async waitForTimeout() {},
              };
              await config.requestHandler({
                page,
                request: { url: request.url, uniqueKey: request.uniqueKey, userData: {} },
                response: { status: () => 200 },
              });
            }
          },
          async teardown() {},
        };
      },
    });

    await session.start();

    await session.runFetchPlan({
      orderedSources: [{ url: 'https://example.com/1' }],
      workerIdMap: new Map(),
    });

    const statsEvents = infoCalls.filter((c) => c.event === 'crawler_stats');
    assert.equal(statsEvents.length, 0, 'no stats event from factory crawlers');
  });
});
