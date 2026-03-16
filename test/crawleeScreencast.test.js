import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { CrawleeFetcher, PlaywrightFetcher } from '../src/fetcher/playwrightFetcher.js';

test('CrawleeFetcher emits screencast frames for browser-backed crawls when callback is provided', async () => {
  const frames = [];
  const config = loadConfig({
    runtimeScreencastEnabled: true,
    capturePageScreenshotEnabled: false,
    autoScrollEnabled: false,
    postLoadWaitMs: 0,
    dynamicFetchRetryBudget: 0,
    pageGotoTimeoutMs: 1000,
    pageNetworkIdleTimeoutMs: 1000,
  });

  const fakeCdpSession = {
    screencastHandler: null,
    async send() {},
    on(event, handler) {
      if (event === 'Page.screencastFrame') {
        this.screencastHandler = handler;
      }
    },
    async detach() {},
  };

  const fakePage = {
    on() {},
    context() {
      return {
        newCDPSession: async () => fakeCdpSession,
      };
    },
    async waitForLoadState() {
      if (typeof fakeCdpSession.screencastHandler === 'function') {
        await fakeCdpSession.screencastHandler({
          sessionId: 1,
          data: 'jpeg-frame-data',
          metadata: {
            deviceWidth: 640,
            deviceHeight: 480,
          },
        });
      }
    },
    async content() {
      return '<html><body>ok</body></html>';
    },
    async title() {
      return 'Example';
    },
    url() {
      return 'https://example.com/specs';
    },
    async evaluate() {},
    async waitForTimeout() {},
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

  const fetcher = new CrawleeFetcher(config, null, {
    onScreencastFrame: (frame) => frames.push(frame),
  });
  fetcher.ensureCrawlee = async () => ({
    PlaywrightCrawler: FakePlaywrightCrawler,
    log: {
      LEVELS: { WARNING: 1 },
      setLevel() {},
    },
  });
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;

  const result = await fetcher.fetch({
    url: 'https://example.com/specs',
    host: 'example.com',
    worker_id: 'fetch-9',
  });

  assert.equal(result.status, 200);
  assert.equal(result.fetchTelemetry.fetcher_kind, 'crawlee');
  assert.equal(frames.length, 1);
  assert.equal(frames[0].worker_id, 'fetch-9');
  assert.equal(frames[0].data, 'jpeg-frame-data');
  assert.equal(frames[0].width, 640);
  assert.equal(frames[0].height, 480);
});

test('CrawleeFetcher reports crawler failures without leaking screencast cleanup errors', async () => {
  const config = loadConfig({
    runtimeScreencastEnabled: true,
    capturePageScreenshotEnabled: false,
    autoScrollEnabled: false,
    postLoadWaitMs: 0,
    dynamicFetchRetryBudget: 0,
    pageGotoTimeoutMs: 1000,
    pageNetworkIdleTimeoutMs: 1000,
  });

  class FakePlaywrightCrawler {
    constructor(options) {
      this.options = options;
    }

    async run() {
      await this.options.failedRequestHandler({
        request: {
          url: 'https://example.com/specs',
        },
        error: new Error('boom'),
      });
    }
  }

  const fetcher = new CrawleeFetcher(config, null, {
    onScreencastFrame: () => {},
  });
  fetcher.ensureCrawlee = async () => ({
    PlaywrightCrawler: FakePlaywrightCrawler,
    log: {
      LEVELS: { WARNING: 1 },
      setLevel() {},
    },
  });
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;

  await assert.rejects(
    () => fetcher.fetch({
      url: 'https://example.com/specs',
      host: 'example.com',
      worker_id: 'fetch-9',
    }),
    /Crawlee fetch failed: boom/,
  );
});

test('CrawleeFetcher falls back to screenshot frames when CDP screencast stays silent', async () => {
  const frames = [];
  const config = loadConfig({
    runtimeScreencastEnabled: true,
    runtimeScreencastFps: 10,
    capturePageScreenshotEnabled: false,
    autoScrollEnabled: false,
    postLoadWaitMs: 0,
    dynamicFetchRetryBudget: 0,
    pageGotoTimeoutMs: 1000,
    pageNetworkIdleTimeoutMs: 1000,
  });

  const fakeCdpSession = {
    async send() {},
    on() {},
    async detach() {},
  };

  const fakePage = {
    on() {},
    context() {
      return {
        newCDPSession: async () => fakeCdpSession,
      };
    },
    async waitForLoadState() {
      await new Promise((resolve) => setTimeout(resolve, 650));
    },
    async content() {
      return '<html><body>ok</body></html>';
    },
    async title() {
      return 'Example';
    },
    url() {
      return 'https://example.com/specs';
    },
    async evaluate() {},
    async waitForTimeout(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    async screenshot() {
      return Buffer.from('jpeg-frame-data', 'utf8');
    },
    viewportSize() {
      return { width: 640, height: 480 };
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

  const fetcher = new CrawleeFetcher(config, null, {
    onScreencastFrame: (frame) => frames.push(frame),
  });
  fetcher.ensureCrawlee = async () => ({
    PlaywrightCrawler: FakePlaywrightCrawler,
    log: {
      LEVELS: { WARNING: 1 },
      setLevel() {},
    },
  });
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;

  const result = await fetcher.fetch({
    url: 'https://example.com/specs',
    host: 'example.com',
    worker_id: 'fetch-9',
  });

  assert.equal(result.status, 200);
  assert.ok(frames.length >= 1);
  assert.equal(frames[0].worker_id, 'fetch-9');
  assert.equal(frames[0].data, Buffer.from('jpeg-frame-data', 'utf8').toString('base64'));
  assert.equal(frames[0].width, 640);
  assert.equal(frames[0].height, 480);
});

test('CrawleeFetcher emits a final fallback screenshot when a silent browser-backed crawl ends before the first interval tick', async () => {
  const frames = [];
  const config = loadConfig({
    runtimeScreencastEnabled: true,
    runtimeScreencastFps: 10,
    capturePageScreenshotEnabled: false,
    autoScrollEnabled: false,
    postLoadWaitMs: 0,
    dynamicFetchRetryBudget: 0,
    pageGotoTimeoutMs: 1000,
    pageNetworkIdleTimeoutMs: 1000,
  });

  const fakeCdpSession = {
    async send() {},
    on() {},
    async detach() {},
  };

  const fakePage = {
    on() {},
    context() {
      return {
        newCDPSession: async () => fakeCdpSession,
      };
    },
    async waitForLoadState() {
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
    async content() {
      return '<html><body>ok</body></html>';
    },
    async title() {
      return 'Example';
    },
    url() {
      return 'https://example.com/specs';
    },
    async evaluate() {},
    async waitForTimeout(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    async screenshot() {
      return Buffer.from('final-short-lived-frame', 'utf8');
    },
    viewportSize() {
      return { width: 800, height: 600 };
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

  const fetcher = new CrawleeFetcher(config, null, {
    onScreencastFrame: (frame) => frames.push(frame),
  });
  fetcher.ensureCrawlee = async () => ({
    PlaywrightCrawler: FakePlaywrightCrawler,
    log: {
      LEVELS: { WARNING: 1 },
      setLevel() {},
    },
  });
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;

  const result = await fetcher.fetch({
    url: 'https://example.com/specs',
    host: 'example.com',
    worker_id: 'fetch-10',
  });

  assert.equal(result.status, 200);
  assert.ok(frames.length >= 1);
  assert.equal(frames[0].worker_id, 'fetch-10');
  assert.equal(frames[0].data, Buffer.from('final-short-lived-frame', 'utf8').toString('base64'));
  assert.equal(frames[0].width, 800);
  assert.equal(frames[0].height, 600);
});

test('CrawleeFetcher emits a fallback screenshot for navigation failures before a response exists', async () => {
  const frames = [];
  const config = loadConfig({
    runtimeScreencastEnabled: true,
    runtimeScreencastFps: 10,
    capturePageScreenshotEnabled: false,
    autoScrollEnabled: false,
    postLoadWaitMs: 0,
    dynamicFetchRetryBudget: 0,
    pageGotoTimeoutMs: 1000,
    pageNetworkIdleTimeoutMs: 1000,
  });

  const fakeCdpSession = {
    async send() {},
    on() {},
    async detach() {},
  };

  const fakePage = {
    on() {},
    context() {
      return {
        newCDPSession: async () => fakeCdpSession,
      };
    },
    async screenshot() {
      return Buffer.from('failed-navigation-frame', 'utf8');
    },
    viewportSize() {
      return { width: 1024, height: 768 };
    },
  };

  class FakePlaywrightCrawler {
    constructor(options) {
      this.options = options;
    }

    async run(requests) {
      const request = {
        url: requests[0].url,
        uniqueKey: requests[0].uniqueKey,
        retryCount: 0,
        userData: {},
      };
      const gotoOptions = {};
      for (const hook of this.options.preNavigationHooks || []) {
        await hook({ request, page: fakePage }, gotoOptions);
      }
      await this.options.failedRequestHandler({
        request,
        error: new Error('navigation failed before response'),
      });
    }
  }

  const fetcher = new CrawleeFetcher(config, null, {
    onScreencastFrame: (frame) => frames.push(frame),
  });
  fetcher.ensureCrawlee = async () => ({
    PlaywrightCrawler: FakePlaywrightCrawler,
    log: {
      LEVELS: { WARNING: 1 },
      setLevel() {},
    },
  });
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;

  await assert.rejects(
    () => fetcher.fetch({
      url: 'https://example.com/specs',
      host: 'example.com',
      worker_id: 'fetch-11',
    }),
    /Crawlee fetch failed: navigation failed before response/,
  );

  assert.ok(frames.length >= 1);
  assert.equal(frames[0].worker_id, 'fetch-11');
  assert.equal(frames[0].data, Buffer.from('failed-navigation-frame', 'utf8').toString('base64'));
  assert.equal(frames[0].width, 1024);
  assert.equal(frames[0].height, 768);
});

test('PlaywrightFetcher falls back to screenshot frames when CDP screencast stays silent', async () => {
  const frames = [];
  const config = loadConfig({
    runtimeScreencastEnabled: true,
    runtimeScreencastFps: 10,
    capturePageScreenshotEnabled: false,
    autoScrollEnabled: false,
    postLoadWaitMs: 0,
    dynamicFetchRetryBudget: 0,
    pageGotoTimeoutMs: 1000,
    pageNetworkIdleTimeoutMs: 1000,
  });

  const fakeCdpSession = {
    async send() {},
    on() {},
    async detach() {},
  };

  const fakePage = {
    on() {},
    context() {
      return {
        newCDPSession: async () => fakeCdpSession,
      };
    },
    async goto() {
      return {
        status() {
          return 200;
        },
      };
    },
    async waitForLoadState() {
      await new Promise((resolve) => setTimeout(resolve, 650));
    },
    async content() {
      return '<html><body>ok</body></html>';
    },
    async title() {
      return 'Example';
    },
    url() {
      return 'https://example.com/specs';
    },
    async evaluate() {},
    async waitForTimeout(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    async screenshot() {
      return Buffer.from('jpeg-frame-data', 'utf8');
    },
    viewportSize() {
      return { width: 640, height: 480 };
    },
    async close() {},
  };

  const fetcher = new PlaywrightFetcher(config, null, {
    onScreencastFrame: (frame) => frames.push(frame),
  });
  fetcher.context = {
    async newPage() {
      return fakePage;
    },
  };
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;

  const result = await fetcher.fetch({
    url: 'https://example.com/specs',
    host: 'example.com',
    worker_id: 'fetch-4',
  });

  assert.equal(result.status, 200);
  assert.ok(frames.length >= 1);
  assert.equal(frames[0].worker_id, 'fetch-4');
  assert.equal(frames[0].data, Buffer.from('jpeg-frame-data', 'utf8').toString('base64'));
  assert.equal(frames[0].width, 640);
  assert.equal(frames[0].height, 480);
});

test('PlaywrightFetcher emits a final fallback screenshot when a silent page closes before the first interval tick', async () => {
  const frames = [];
  const config = loadConfig({
    runtimeScreencastEnabled: true,
    runtimeScreencastFps: 10,
    capturePageScreenshotEnabled: false,
    autoScrollEnabled: false,
    postLoadWaitMs: 0,
    dynamicFetchRetryBudget: 0,
    pageGotoTimeoutMs: 1000,
    pageNetworkIdleTimeoutMs: 1000,
  });

  const fakeCdpSession = {
    async send() {},
    on() {},
    async detach() {},
  };

  const fakePage = {
    on() {},
    context() {
      return {
        newCDPSession: async () => fakeCdpSession,
      };
    },
    async goto() {
      return {
        status() {
          return 200;
        },
      };
    },
    async waitForLoadState() {
      await new Promise((resolve) => setTimeout(resolve, 25));
    },
    async content() {
      return '<html><body>ok</body></html>';
    },
    async title() {
      return 'Example';
    },
    url() {
      return 'https://example.com/specs';
    },
    async evaluate() {},
    async waitForTimeout(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
    async screenshot() {
      return Buffer.from('final-short-lived-frame', 'utf8');
    },
    viewportSize() {
      return { width: 800, height: 600 };
    },
    async close() {},
  };

  const fetcher = new PlaywrightFetcher(config, null, {
    onScreencastFrame: (frame) => frames.push(frame),
  });
  fetcher.context = {
    async newPage() {
      return fakePage;
    },
  };
  fetcher.enforceRobots = async () => null;
  fetcher.waitForHostSlot = async () => 0;

  const result = await fetcher.fetch({
    url: 'https://example.com/specs',
    host: 'example.com',
    worker_id: 'fetch-5',
  });

  assert.equal(result.status, 200);
  assert.ok(frames.length >= 1);
  assert.equal(frames[0].worker_id, 'fetch-5');
  assert.equal(frames[0].data, Buffer.from('final-short-lived-frame', 'utf8').toString('base64'));
  assert.equal(frames[0].width, 800);
  assert.equal(frames[0].height, 600);
});
