import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';
import { createLoggerSpy } from './factories/crawlTestDoubles.js';

/**
 * Fix 1: timeoutRescued flag must propagate through the event pipeline.
 * The source_fetch_failed logger event must carry timeout_rescued so
 * the bridge → worker pool builder → GUI badge chain can distinguish
 * "failed with data" from "failed with nothing".
 *
 * Fix 2: Progressive screenshot stashing — extraction results must be
 * stashed on request.userData so failedRequestHandler can rescue them.
 */

// Factory: simulates handler timeout AFTER page captured AND extraction completed.
function createTimeoutAfterExtractionFactory({
  html = '<html><body>Product</body></html>',
  status = 200,
  title = 'Product',
  screenshots = [{ kind: 'page', bytes: Buffer.from('fake-png'), width: 1280, height: 720, captured_at: '2026-03-27T00:00:00Z' }],
} = {}) {
  let lastConfig = null;

  return {
    factory(config) {
      lastConfig = config;
      return {
        async run(requests = []) {
          for (const request of requests) {
            const reqObj = {
              url: request.url,
              uniqueKey: request.uniqueKey,
              userData: {
                __capturedPage: { html, finalUrl: request.url, title, status },
                __capturedExtractions: { screenshot: { screenshots } },
              },
              retryCount: 1,
              noRetry: true,
            };

            await config.failedRequestHandler(
              { request: reqObj },
              new Error('requestHandler timed out after 45 seconds.'),
            );
          }
        },
        async teardown() {},
      };
    },
    getLastConfig() { return lastConfig; },
  };
}

// Factory: simulates handler timeout AFTER page captured but BEFORE extraction ran.
function createTimeoutBeforeExtractionFactory({
  html = '<html><body>Product</body></html>',
  status = 200,
  title = 'Product',
} = {}) {
  return {
    factory(config) {
      return {
        async run(requests = []) {
          for (const request of requests) {
            const reqObj = {
              url: request.url,
              uniqueKey: request.uniqueKey,
              userData: {
                __capturedPage: { html, finalUrl: request.url, title, status },
                // NO __capturedExtractions — extraction never ran
              },
              retryCount: 1,
              noRetry: true,
            };

            await config.failedRequestHandler(
              { request: reqObj },
              new Error('requestHandler timed out after 45 seconds.'),
            );
          }
        },
        async teardown() {},
      };
    },
  };
}

describe('Fix 1: timeout_rescued flag in source_fetch_failed event', () => {
  it('source_fetch_failed event carries timeout_rescued: true when page was captured', async () => {
    const crawler = createTimeoutAfterExtractionFactory();
    const { logger, infoCalls } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('https://www.amazon.com/product/123');

    const failedEvents = infoCalls.filter((c) => c.event === 'source_fetch_failed');
    assert.equal(failedEvents.length, 1, 'one failed event emitted');
    assert.equal(failedEvents[0].timeout_rescued, true, 'timeout_rescued flag must be true');
  });

  it('source_fetch_failed event does NOT carry timeout_rescued when no page data exists', async () => {
    let lastConfig = null;
    const crawler = {
      factory(config) {
        lastConfig = config;
        return {
          async run(requests = []) {
            for (const request of requests) {
              await config.failedRequestHandler(
                { request: { url: request.url, uniqueKey: request.uniqueKey, userData: {}, retryCount: 1, noRetry: true } },
                new Error('Navigation timed out'),
              );
            }
          },
          async teardown() {},
        };
      },
    };

    const { logger, infoCalls } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('https://slow-site.com');

    const failedEvents = infoCalls.filter((c) => c.event === 'source_fetch_failed');
    assert.equal(failedEvents.length, 1);
    assert.equal(failedEvents[0].timeout_rescued, undefined, 'no flag when page was not captured');
  });

  it('source_fetch_failed event does NOT carry timeout_rescued for blocked pages', async () => {
    const crawler = {
      factory(config) {
        return {
          async run(requests = []) {
            for (const request of requests) {
              await config.failedRequestHandler(
                {
                  request: {
                    url: request.url,
                    uniqueKey: request.uniqueKey,
                    userData: {
                      __blockInfo: { blocked: true, blockReason: 'status_403', status: 403, html: '<html>Forbidden</html>', title: '', finalUrl: request.url },
                    },
                    retryCount: 1,
                    noRetry: true,
                  },
                },
                new Error('blocked:status_403'),
              );
            }
          },
          async teardown() {},
        };
      },
    };

    const { logger, infoCalls } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('https://shop.asus.com/product');

    const failedEvents = infoCalls.filter((c) => c.event === 'source_fetch_failed');
    assert.equal(failedEvents.length, 1);
    assert.equal(failedEvents[0].timeout_rescued, undefined, 'blocked pages are not timeout-rescued');
  });
});

describe('Fix 2: progressive screenshot stashing', () => {
  it('failedRequestHandler returns screenshots from __capturedExtractions', async () => {
    const fakeScreenshots = [
      { kind: 'page', bytes: Buffer.from('shot-1'), width: 1280, height: 720, captured_at: '2026-03-27T00:00:00Z' },
      { kind: 'crop', bytes: Buffer.from('shot-2'), width: 400, height: 300, captured_at: '2026-03-27T00:00:01Z' },
    ];
    const crawler = createTimeoutAfterExtractionFactory({ screenshots: fakeScreenshots });
    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('https://www.amazon.com/product/123');

    assert.equal(result.timeoutRescued, true);
    assert.equal(result.screenshots.length, 2, 'both screenshots rescued');
    assert.equal(result.screenshots[0].kind, 'page');
    assert.equal(result.screenshots[1].kind, 'crop');
  });

  it('failedRequestHandler returns empty screenshots when no __capturedExtractions exist', async () => {
    const crawler = createTimeoutBeforeExtractionFactory();
    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('https://www.example.com');

    assert.equal(result.timeoutRescued, true);
    assert.deepEqual(result.screenshots, [], 'no screenshots — extraction never ran');
  });

  it('requestHandler stashes extraction results on request.userData after extraction completes', async () => {
    let capturedUserData = null;

    const crawler = {
      factory(config) {
        return {
          async run(requests = []) {
            for (const request of requests) {
              const page = {
                async content() { return '<html><body>Content</body></html>'; },
                url() { return request.url; },
                async title() { return 'Test'; },
                viewportSize() { return { width: 1280, height: 720 }; },
                async screenshot() { return Buffer.from('fake'); },
                async addInitScript() {},
                async evaluate() { return 0; },
                async waitForTimeout() {},
              };
              const reqObj = { url: request.url, uniqueKey: request.uniqueKey, userData: {} };

              await config.requestHandler({
                page,
                request: reqObj,
                response: { status: () => 200 },
              });

              capturedUserData = { ...reqObj.userData };
            }
          },
          async teardown() {},
        };
      },
    };

    const fakeExtractor = {
      async runExtractions() {
        return { screenshot: { screenshots: [{ kind: 'page', bytes: Buffer.from('test') }] } };
      },
    };

    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      extractionRunner: fakeExtractor,
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('http://example.com');

    assert.ok(capturedUserData?.__capturedExtractions, 'extraction results should be stashed on userData');
    assert.ok(capturedUserData.__capturedExtractions.screenshot, 'screenshot extraction should be present');
    assert.equal(capturedUserData.__capturedExtractions.screenshot.screenshots.length, 1);
  });
});
