import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';
import { createLoggerSpy } from './factories/crawlTestDoubles.js';

/**
 * Root Cause A+B: When Crawlee's handler timeout fires AFTER page.content()
 * captured HTML, the failedRequestHandler should rescue the stashed page data
 * instead of returning an empty result. Same pattern as __blockInfo rescue.
 *
 * Simulated by making the factory call requestHandler (which stashes page data
 * on request.userData.__capturedPage), then calling failedRequestHandler with
 * a timeout error as if Crawlee's AutoscaledPool fired the timeout.
 */

// WHY: Custom factory that simulates a timeout AFTER the requestHandler
// has executed far enough to stash page data. In real Crawlee, the
// AutoscaledPool rejects the handler promise externally after N seconds,
// then calls errorHandler → failedRequestHandler. The handler's local
// variables (html, finalUrl, etc.) are lost, but request.userData survives.
function createTimeoutSimulatingFactory({ html = '<html><body><h1>Product</h1></body></html>', status = 200, finalUrl, title = 'Product Page' } = {}) {
  let lastConfig = null;

  return {
    factory(config) {
      lastConfig = config;
      return {
        async run(requests = []) {
          for (const request of requests) {
            // Simulate: handler ran far enough to stash page data,
            // then timeout fired, then failedRequestHandler is called.
            // In real Crawlee, request.userData persists across handler → failedHandler.
            const reqObj = {
              url: request.url,
              uniqueKey: request.uniqueKey,
              userData: {
                __capturedPage: {
                  html,
                  finalUrl: finalUrl ?? request.url,
                  title,
                  status,
                },
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

// Factory that simulates a timeout with NO stashed data (handler was
// interrupted before reaching page.content).
function createEarlyTimeoutFactory() {
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
              userData: {},
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

describe('crawlSession timeout rescue (Root Cause A+B)', () => {
  it('failedRequestHandler rescues stashed HTML when handler times out after page.content()', async () => {
    const expectedHtml = '<html><body><h1>Logitech G Pro X</h1><p>Specs here</p></body></html>';
    const crawler = createTimeoutSimulatingFactory({
      html: expectedHtml,
      status: 200,
      finalUrl: 'https://www.amazon.com/product/123',
      title: 'Logitech G Pro X Superlight 2',
    });
    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('https://www.amazon.com/product/123');

    assert.equal(result.html, expectedHtml, 'rescued HTML should be returned');
    assert.equal(result.finalUrl, 'https://www.amazon.com/product/123');
    assert.equal(result.title, 'Logitech G Pro X Superlight 2');
    assert.equal(result.status, 200);
    assert.equal(result.fetchError, 'requestHandler timed out after 45 seconds.');
    assert.equal(result.timeoutRescued, true, 'result should be flagged as timeout-rescued');
  });

  it('failedRequestHandler returns empty result when handler times out BEFORE page.content()', async () => {
    const crawler = createEarlyTimeoutFactory();
    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('https://www.example.com');

    assert.equal(result.html, '', 'no rescued HTML — handler never reached page.content()');
    assert.equal(result.status, 0);
    assert.equal(result.timeoutRescued, undefined, 'not flagged as timeout-rescued');
  });

  it('block rescue (__blockInfo) still takes priority over timeout rescue', async () => {
    let lastConfig = null;
    const crawler = {
      factory(config) {
        lastConfig = config;
        return {
          async run(requests = []) {
            for (const request of requests) {
              const reqObj = {
                url: request.url,
                uniqueKey: request.uniqueKey,
                userData: {
                  __blockInfo: {
                    blocked: true,
                    blockReason: 'status_403',
                    status: 403,
                    html: '<html>Forbidden</html>',
                    title: 'Forbidden',
                    finalUrl: request.url,
                  },
                  __capturedPage: {
                    html: '<html>Should not use this</html>',
                    finalUrl: request.url,
                    title: 'Should not use this',
                    status: 200,
                  },
                },
                retryCount: 1,
                noRetry: true,
              };

              await config.failedRequestHandler(
                { request: reqObj },
                new Error('blocked:status_403'),
              );
            }
          },
          async teardown() {},
        };
      },
    };

    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('https://shop.asus.com/product');

    assert.equal(result.blocked, true, 'block info takes priority');
    assert.equal(result.blockReason, 'status_403');
    assert.equal(result.html, '<html>Forbidden</html>');
    assert.equal(result.timeoutRescued, undefined, 'not flagged as timeout-rescued');
  });

  it('requestHandler stashes page data on request.userData before expensive plugin hooks', async () => {
    const hookOrder = [];
    let capturedUserData = null;

    const plugin = {
      name: 'slow-plugin',
      hooks: {
        async onCapture({ request }) {
          hookOrder.push('onCapture');
          capturedUserData = { ...request.userData };
        },
      },
    };

    let lastConfig = null;
    const crawler = {
      factory(config) {
        lastConfig = config;
        return {
          async run(requests = []) {
            for (const request of requests) {
              const page = {
                async content() { return '<html><body>Real content</body></html>'; },
                url() { return request.url; },
                async title() { return 'Test'; },
                viewportSize() { return { width: 1280, height: 720 }; },
                async screenshot() { return Buffer.from('fake'); },
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
    };

    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [plugin],
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('http://example.com');

    assert.ok(capturedUserData?.__capturedPage, 'page data should be stashed before onCapture hook');
    assert.equal(capturedUserData.__capturedPage.html, '<html><body>Real content</body></html>');
    assert.equal(capturedUserData.__capturedPage.status, 200);
  });
});

describe('crawlSession retry suppression', () => {
  // WHY: When the handler already captured HTML (__capturedPage stashed) and
  // then timed out, retrying wastes another full 45s loading the same page.
  // The errorHandler should set noRetry when captured data already exists.
  it('errorHandler sets noRetry when timeout fires after page data was captured', async () => {
    let errorHandlerCalled = false;
    let noRetryAfterErrorHandler = null;

    const crawler = {
      factory(config) {
        return {
          async run(requests = []) {
            for (const request of requests) {
              const reqObj = {
                url: request.url,
                uniqueKey: request.uniqueKey,
                userData: { __capturedPage: { html: '<html>real</html>', finalUrl: request.url, title: 'T', status: 200 } },
                retryCount: 0,
                noRetry: false,
              };

              // Simulate Crawlee flow: errorHandler fires before retry decision
              await config.errorHandler(
                { request: reqObj },
                new Error('requestHandler timed out after 45 seconds.'),
              );
              errorHandlerCalled = true;
              noRetryAfterErrorHandler = reqObj.noRetry;

              // Then failedRequestHandler runs (since noRetry should be true now)
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

    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('https://www.amazon.com/product/123');

    assert.ok(errorHandlerCalled, 'errorHandler should have been called');
    assert.equal(noRetryAfterErrorHandler, true, 'noRetry should be true — we already have HTML, retrying wastes 45s');
  });

  it('errorHandler does NOT set noRetry for timeout when no page data was captured', async () => {
    let noRetryAfterErrorHandler = null;

    const crawler = {
      factory(config) {
        return {
          async run(requests = []) {
            for (const request of requests) {
              const reqObj = {
                url: request.url,
                uniqueKey: request.uniqueKey,
                userData: {},
                retryCount: 0,
                noRetry: false,
              };

              await config.errorHandler(
                { request: reqObj },
                new Error('requestHandler timed out after 45 seconds.'),
              );
              noRetryAfterErrorHandler = reqObj.noRetry;

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

    const { logger } = createLoggerSpy();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('https://slow-site.com');

    assert.equal(noRetryAfterErrorHandler, false, 'should allow retry — handler never reached page.content(), retry might succeed');
  });

  it('errorHandler does not emit source_fetch_retrying when noRetry is set', async () => {
    const { logger, infoCalls } = createLoggerSpy();

    const crawler = {
      factory(config) {
        return {
          async run(requests = []) {
            for (const request of requests) {
              const reqObj = {
                url: request.url,
                uniqueKey: request.uniqueKey,
                userData: { __capturedPage: { html: '<html>data</html>', finalUrl: request.url, title: 'T', status: 200 } },
                retryCount: 0,
                noRetry: false,
              };

              await config.errorHandler(
                { request: reqObj },
                new Error('requestHandler timed out after 45 seconds.'),
              );

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

    const session = createCrawlSession({
      settings: {},
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('https://www.amazon.com/product');

    const retryEvents = infoCalls.filter(c => c.event === 'source_fetch_retrying');
    assert.equal(retryEvents.length, 0, 'no retrying event should be emitted — noRetry was set');
  });
});
