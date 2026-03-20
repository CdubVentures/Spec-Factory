import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_HTML = readFileSync(
  join(__dirname, 'fixtures', 'google-serp-sample.html'), 'utf8'
);

async function loadModule() {
  return import('../searchGoogle.js');
}

// ---------------------------------------------------------------------------
// Test helpers — mock crawler factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock crawler factory that captures options and invokes the
 * requestHandler with a fake page object.
 *
 * @param {object} opts
 * @param {string} opts.html - HTML to return from page.content()
 * @param {string} [opts.url] - URL the page reports
 * @param {boolean} [opts.shouldThrow] - simulate navigation failure
 * @param {Buffer|null} [opts.screenshotBuffer] - screenshot bytes
 * @returns {{ factory, calls }}
 */
function createMockCrawlerFactory({
  html = FIXTURE_HTML,
  url = 'https://www.google.com/search?q=test',
  shouldThrow = false,
  screenshotBuffer = null,
} = {}) {
  const calls = {
    crawlerOptions: null,
    proxyConfig: null,
    runUrls: null,
  };

  const factory = async (options) => {
    calls.crawlerOptions = options;
    return {
      run: async (urls) => {
        calls.runUrls = urls;
        if (shouldThrow) throw new Error('Navigation timeout');

        // Build fake page
        const fakePage = {
          url: () => url,
          content: async () => html,
          screenshot: async (opts) => screenshotBuffer || Buffer.from('fake-jpeg', 'utf8'),
          evaluate: async () => {},
          waitForSelector: async () => {},
          setExtraHTTPHeaders: async () => {},
          addInitScript: async () => {},
          viewportSize: () => ({ width: 1920, height: 1080 }),
        };
        const fakeResponse = { status: () => 200 };

        // Invoke requestHandler if present
        const fakeSession = {
          markBad: () => { calls.sessionBurned = true; },
          retire: () => { calls.sessionRetired = true; },
        };
        const closeCookieModals = async () => { calls.closeCookieModalsCalled = true; };
        if (typeof options.requestHandler === 'function') {
          await options.requestHandler({ page: fakePage, response: fakeResponse, request: { url }, session: fakeSession, closeCookieModals });
        }
      },
    };
  };

  // Mock ProxyConfiguration constructor
  factory._ProxyConfiguration = class MockProxyConfiguration {
    constructor(opts) {
      calls.proxyConfig = opts;
    }
  };

  // Mock RequestList
  factory._RequestList = class MockRequestList {
    static async open({ sources }) {
      calls.requestListSources = sources;
      return new MockRequestList();
    }
  };

  return { factory, calls };
}

function fastMockOptions(factory, overrides = {}) {
  return {
    _crawlerFactory: factory,
    minQueryIntervalMs: 0,
    postResultsDelayMs: 0,
    screenshotsEnabled: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchGoogle', () => {
  beforeEach(async () => {
    const { resetGoogleSearchPacingForTests } = await loadModule();
    resetGoogleSearchPacingForTests();
  });

  describe('test seams', () => {
    it('exports a pacing reset helper for isolated tests', async () => {
      const mod = await loadModule();
      assert.equal(typeof mod.resetGoogleSearchPacingForTests, 'function');
    });

    it('postResultsDelayMs=0 skips the mocked render-settling delay', async () => {
      const { searchGoogle, resetGoogleSearchPacingForTests } = await loadModule();
      resetGoogleSearchPacingForTests();
      const { factory } = createMockCrawlerFactory();

      const startedAt = Date.now();
      const out = await searchGoogle({
        query: 'fast mock query',
        ...fastMockOptions(factory),
      });
      const elapsedMs = Date.now() - startedAt;

      assert.ok(out.results.length > 0, 'expected parsed results');
      assert.ok(elapsedMs < 500, `expected mocked search to finish quickly, got ${elapsedMs}ms`);
    });
  });

  describe('empty / invalid input', () => {
    it('returns { results: [] } when query is empty', async () => {
      const { searchGoogle } = await loadModule();
      const out = await searchGoogle({ query: '' });
      assert.deepEqual(out.results, []);
    });

    it('returns { results: [] } when query is null', async () => {
      const { searchGoogle } = await loadModule();
      const out = await searchGoogle({ query: null });
      assert.deepEqual(out.results, []);
    });

    it('returns { results: [] } when query is undefined', async () => {
      const { searchGoogle } = await loadModule();
      const out = await searchGoogle({ query: undefined });
      assert.deepEqual(out.results, []);
    });
  });

  describe('happy path', () => {
    it('returns results with correct shape from mock DOM', async () => {
      const { searchGoogle } = await loadModule();
      const { factory } = createMockCrawlerFactory();
      const out = await searchGoogle({
        query: 'logitech mx master 3s specifications',
        ...fastMockOptions(factory),
      });
      assert.ok(Array.isArray(out.results), 'results is an array');
      assert.ok(out.results.length >= 5, `expected >= 5 results, got ${out.results.length}`);
      for (const row of out.results) {
        assert.ok(row.url, 'has url');
        assert.ok(row.title, 'has title');
        assert.equal(typeof row.snippet, 'string', 'snippet is string');
        assert.equal(row.provider, 'google', 'provider is google');
        assert.equal(row.query, 'logitech mx master 3s specifications', 'query passed through');
      }
    });

    it('every result has provider === "google"', async () => {
      const { searchGoogle } = await loadModule();
      const { factory } = createMockCrawlerFactory();
      const out = await searchGoogle({
        query: 'test query',
        ...fastMockOptions(factory),
      });
      for (const row of out.results) {
        assert.equal(row.provider, 'google');
      }
    });

    it('no result has an engines field', async () => {
      const { searchGoogle } = await loadModule();
      const { factory } = createMockCrawlerFactory();
      const out = await searchGoogle({
        query: 'test query',
        ...fastMockOptions(factory),
      });
      for (const row of out.results) {
        assert.equal(row.engines, undefined, 'engines field must not exist');
      }
    });

    it('respects limit parameter', async () => {
      const { searchGoogle } = await loadModule();
      const { factory } = createMockCrawlerFactory();
      const out = await searchGoogle({
        query: 'test',
        limit: 3,
        ...fastMockOptions(factory),
      });
      assert.ok(out.results.length <= 3, `expected <= 3 results, got ${out.results.length}`);
    });
  });

  describe('CAPTCHA / consent detection', () => {
    it('returns { results: [] } on CAPTCHA page and burns session', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory({
        url: 'https://www.google.com/sorry/index?continue=https://www.google.com/search',
        html: '<html><body>Our systems have detected unusual traffic from your computer</body></html>',
      });
      const warnings = [];
      const logger = { warn: (evt, data) => warnings.push({ evt, data }), info: () => {} };
      const out = await searchGoogle({
        query: 'test',
        ...fastMockOptions(factory),
        logger,
      });
      assert.deepEqual(out.results, [], 'no results on CAPTCHA');
      // WHY: CAPTCHA is now caught inside the requestHandler (early detection).
      // The handler burns the session and throws, which triggers the outer catch.
      assert.ok(
        warnings.some(w => w.evt === 'google_crawlee_captcha_in_handler'),
        'logged in-handler captcha warning'
      );
      assert.ok(calls.sessionRetired, 'session was retired on CAPTCHA');
    });
  });

  describe('error resilience', () => {
    it('returns { results: [] } on navigation timeout (does not throw)', async () => {
      const { searchGoogle } = await loadModule();
      const { factory } = createMockCrawlerFactory({ shouldThrow: true });
      const out = await searchGoogle({
        query: 'test',
        ...fastMockOptions(factory),
      });
      assert.deepEqual(out.results, []);
    });
  });

  describe('proxy wiring', () => {
    it('passes proxyUrls to ProxyConfiguration when array is non-empty', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory();
      await searchGoogle({
        query: 'test',
        proxyUrls: ['http://user:pass@proxy1:80', 'http://user:pass@proxy2:80'],
        ...fastMockOptions(factory),
      });
      assert.ok(calls.proxyConfig, 'ProxyConfiguration was created');
      assert.deepEqual(calls.proxyConfig.proxyUrls, [
        'http://user:pass@proxy1:80',
        'http://user:pass@proxy2:80',
      ]);
    });

    it('does NOT create ProxyConfiguration when proxyUrls is empty', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory();
      await searchGoogle({
        query: 'test',
        proxyUrls: [],
        ...fastMockOptions(factory),
      });
      assert.equal(calls.proxyConfig, null, 'no proxy config created');
    });
  });

  describe('pacing', () => {
    it('respects minQueryIntervalMs between calls', async () => {
      const { searchGoogle } = await loadModule();
      const { factory: f1 } = createMockCrawlerFactory();
      const { factory: f2 } = createMockCrawlerFactory();

      const start = Date.now();
      await searchGoogle({ query: 'first', ...fastMockOptions(f1, { minQueryIntervalMs: 200 }) });
      await searchGoogle({ query: 'second', ...fastMockOptions(f2, { minQueryIntervalMs: 200 }) });
      const elapsed = Date.now() - start;

      // Second call should have waited at least ~200ms (allow some slack)
      assert.ok(elapsed >= 150, `expected >= 150ms total elapsed, got ${elapsed}ms`);
    });
  });

  describe('screenshot capture', () => {
    it('returns screenshot metadata when screenshotsEnabled=true', async () => {
      const { searchGoogle } = await loadModule();
      const fakeBuffer = Buffer.alloc(1024, 0xff);
      const { factory } = createMockCrawlerFactory({ screenshotBuffer: fakeBuffer });
      const out = await searchGoogle({
        query: 'test screenshot',
        ...fastMockOptions(factory, { screenshotsEnabled: true }),
        screenshotsEnabled: true,
      });
      assert.ok(out.screenshot, 'screenshot metadata present');
      assert.ok(Buffer.isBuffer(out.screenshot.buffer), 'buffer is a Buffer');
      assert.equal(out.screenshot.bytes, fakeBuffer.length, 'bytes matches buffer length');
      assert.ok(out.screenshot.ts, 'timestamp present');
      assert.ok(out.screenshot.queryHash, 'queryHash present');
    });

    it('does NOT return screenshot when screenshotsEnabled=false', async () => {
      const { searchGoogle } = await loadModule();
      const { factory } = createMockCrawlerFactory();
      const out = await searchGoogle({
        query: 'test no screenshot',
        ...fastMockOptions(factory),
      });
      assert.equal(out.screenshot, undefined, 'no screenshot field');
    });
  });

  describe('crawler options wiring', () => {
    it('headless is always true', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory();
      await searchGoogle({
        query: 'test',
        ...fastMockOptions(factory),
      });
      const opts = calls.crawlerOptions;
      assert.equal(opts?.launchContext?.launchOptions?.headless, true);
    });

    it('retryOnBlocked is true', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory();
      await searchGoogle({
        query: 'test',
        ...fastMockOptions(factory),
      });
      assert.equal(calls.crawlerOptions.retryOnBlocked, true);
    });

    it('persistCookiesPerSession is true', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory();
      await searchGoogle({
        query: 'test',
        ...fastMockOptions(factory),
      });
      assert.equal(calls.crawlerOptions.persistCookiesPerSession, true);
    });

    it('Chrome args include --disable-background-networking', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory();
      await searchGoogle({
        query: 'test',
        ...fastMockOptions(factory),
      });
      const args = calls.crawlerOptions?.launchContext?.launchOptions?.args || [];
      assert.ok(args.includes('--disable-background-networking'), 'background networking disabled');
    });

    it('URL uses udm=14 and does not include num=', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory();
      await searchGoogle({
        query: 'test query',
        ...fastMockOptions(factory),
      });
      const sources = calls.requestListSources || [];
      const requestUrl = sources[0]?.url || '';
      assert.ok(requestUrl.includes('udm=14'), `URL should include udm=14: ${requestUrl}`);
      assert.ok(!requestUrl.includes('num='), `URL should not include num=: ${requestUrl}`);
    });

    it('uses MODERN_WINDOWS_CHROME fingerprint preset', async () => {
      const { searchGoogle } = await loadModule();
      const { factory, calls } = createMockCrawlerFactory();
      await searchGoogle({
        query: 'test',
        ...fastMockOptions(factory),
      });
      const fpOpts = calls.crawlerOptions?.browserPoolOptions?.fingerprintOptions?.fingerprintGeneratorOptions;
      assert.ok(fpOpts, 'fingerprint options present');
      assert.equal(fpOpts.slim, undefined, 'slim not set');
    });
  });
});
