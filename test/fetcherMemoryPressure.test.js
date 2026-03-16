import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { CrawleeFetcher, PlaywrightFetcher } from '../src/fetcher/playwrightFetcher.js';

function buildConfig(overrides = {}) {
  return loadConfig({
    runtimeScreencastEnabled: false,
    capturePageScreenshotEnabled: true,
    capturePageScreenshotSelectors: '.missing-selector',
    capturePageScreenshotFormat: 'jpeg',
    capturePageScreenshotQuality: 60,
    autoScrollEnabled: false,
    postLoadWaitMs: 0,
    dynamicFetchRetryBudget: 0,
    pageGotoTimeoutMs: 1000,
    pageNetworkIdleTimeoutMs: 1000,
    ...overrides,
  });
}

test('PlaywrightFetcher captures screenshot before materializing HTML content on browser-heavy pages', async () => {
  const order = [];
  const config = buildConfig();
  const fetcher = new PlaywrightFetcher(config, null);
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;
  fetcher.captureInteractiveSignals = async () => {};
  fetcher.context = {
    newPage: async () => ({
      on() {},
      async goto() {
        order.push('goto');
        return { status: () => 200 };
      },
      async waitForLoadState() {
        order.push('waitForLoadState');
      },
      url() {
        return 'https://example.com/final';
      },
      async title() {
        order.push('title');
        return 'Example';
      },
      async content() {
        order.push('content');
        return '<html><body>heavy</body></html>';
      },
      async $(selector) {
        order.push(`query:${selector}`);
        return null;
      },
      async screenshot() {
        order.push('screenshot');
        return Buffer.from('image-bytes');
      },
      viewportSize() {
        return { width: 1440, height: 900 };
      },
      async close() {
        order.push('close');
      },
    }),
  };

  const result = await fetcher.fetch({
    url: 'https://example.com/specs',
    host: 'example.com',
  });

  assert.equal(result.status, 200);
  assert.equal(result.finalUrl, 'https://example.com/final');
  assert.equal(result.title, 'Example');
  assert.equal(result.html, '<html><body>heavy</body></html>');
  assert.ok(Buffer.isBuffer(result.screenshot.bytes));
  assert.ok(
    order.indexOf('screenshot') < order.indexOf('content'),
    `expected screenshot before content, saw ${order.join(' -> ')}`
  );
});

test('CrawleeFetcher captures screenshot before materializing HTML content on browser-heavy pages', async () => {
  const order = [];
  const config = buildConfig();

  const fakePage = {
    on() {},
    async waitForLoadState() {
      order.push('waitForLoadState');
    },
    async title() {
      order.push('title');
      return 'Example';
    },
    url() {
      return 'https://example.com/final';
    },
    async content() {
      order.push('content');
      return '<html><body>heavy</body></html>';
    },
    async $(selector) {
      order.push(`query:${selector}`);
      return null;
    },
    async screenshot() {
      order.push('screenshot');
      return Buffer.from('image-bytes');
    },
    viewportSize() {
      return { width: 1440, height: 900 };
    },
  };

  class FakePlaywrightCrawler {
    constructor(options) {
      this.options = options;
    }

    async run() {
      await this.options.requestHandler({
        page: fakePage,
        request: {
          retryCount: 0,
          loadedTimeMillis: 12,
        },
        response: {
          status() {
            return 200;
          },
        },
      });
    }
  }

  const fetcher = new CrawleeFetcher(config, null);
  fetcher.ensureCrawlee = async () => ({
    PlaywrightCrawler: FakePlaywrightCrawler,
    log: {
      LEVELS: { WARNING: 1 },
      setLevel() {},
    },
  });
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;
  fetcher.captureInteractiveSignals = async () => {};

  const result = await fetcher.fetch({
    url: 'https://example.com/specs',
    host: 'example.com',
  });

  assert.equal(result.status, 200);
  assert.equal(result.finalUrl, 'https://example.com/final');
  assert.equal(result.title, 'Example');
  assert.equal(result.html, '<html><body>heavy</body></html>');
  assert.ok(Buffer.isBuffer(result.screenshot.bytes));
  assert.ok(
    order.indexOf('screenshot') < order.indexOf('content'),
    `expected screenshot before content, saw ${order.join(' -> ')}`
  );
});
