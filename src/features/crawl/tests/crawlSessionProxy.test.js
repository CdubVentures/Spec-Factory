import test from 'node:test';
import assert from 'node:assert/strict';

import { parseProxyUrls, createCrawlSession } from '../crawlSession.js';

// ---------------------------------------------------------------------------
// parseProxyUrls — trust boundary (JSON → validated array)
// ---------------------------------------------------------------------------

test('parseProxyUrls returns empty array for empty/null input', () => {
  assert.deepStrictEqual(parseProxyUrls(''), []);
  assert.deepStrictEqual(parseProxyUrls(null), []);
  assert.deepStrictEqual(parseProxyUrls(undefined), []);
});

test('parseProxyUrls parses valid JSON array of proxy URLs', () => {
  const result = parseProxyUrls('["http://user:pass@host:80", "http://proxy2:8080"]');
  assert.deepStrictEqual(result, ['http://user:pass@host:80', 'http://proxy2:8080']);
});

test('parseProxyUrls returns empty array for invalid JSON', () => {
  assert.deepStrictEqual(parseProxyUrls('{not valid json'), []);
});

test('parseProxyUrls returns empty array for non-array JSON', () => {
  assert.deepStrictEqual(parseProxyUrls('{"key": "value"}'), []);
  assert.deepStrictEqual(parseProxyUrls('"just a string"'), []);
  assert.deepStrictEqual(parseProxyUrls('42'), []);
});

test('parseProxyUrls filters out non-string and empty entries', () => {
  const result = parseProxyUrls('["http://valid:80", null, 42, "", "  ", "http://also-valid:80"]');
  assert.deepStrictEqual(result, ['http://valid:80', 'http://also-valid:80']);
});

// ---------------------------------------------------------------------------
// Crawlee proxy wiring — full config via _crawlerFactory
// ---------------------------------------------------------------------------

function captureConfig(settings = {}) {
  let captured = null;
  const session = createCrawlSession({
    settings,
    plugins: [],
    _crawlerFactory: (config) => {
      captured = config;
      return { run: async () => {}, teardown: async () => {} };
    },
  });
  // start() is sync when _crawlerFactory is provided
  session.start();
  return captured;
}

test('proxy URLs in settings → _proxyUrls populated in config', () => {
  const config = captureConfig({
    crawleeProxyUrlsJson: '["http://user:pass@proxy.io:80"]',
  });
  assert.deepStrictEqual(config._proxyUrls, ['http://user:pass@proxy.io:80']);
});

test('empty proxy URLs → no _proxyUrls and no proxyConfiguration', () => {
  const config = captureConfig({ crawleeProxyUrlsJson: '' });
  assert.deepStrictEqual(config._proxyUrls, []);
  assert.equal(config.proxyConfiguration, undefined);
});

test('invalid proxy JSON → graceful fallback, no proxyConfiguration', () => {
  const config = captureConfig({ crawleeProxyUrlsJson: '{bad' });
  assert.deepStrictEqual(config._proxyUrls, []);
  assert.equal(config.proxyConfiguration, undefined);
});

// ---------------------------------------------------------------------------
// Session pool wiring
// ---------------------------------------------------------------------------

test('session pool enabled by default', () => {
  const config = captureConfig({});
  assert.equal(config.useSessionPool, true);
  assert.equal(config.persistCookiesPerSession, true);
  assert.equal(config.sessionPoolOptions.maxPoolSize, 100);
  assert.equal(config.sessionPoolOptions.sessionOptions.maxUsageCount, 50);
  assert.equal(config.sessionPoolOptions.sessionOptions.maxAgeSecs, 3000);
});

test('session pool disabled when setting is false', () => {
  const config = captureConfig({ crawleeUseSessionPool: false });
  assert.equal(config.useSessionPool, false);
});

test('session pool custom values flow through', () => {
  const config = captureConfig({
    crawleeSessionPoolSize: 200,
    crawleeSessionMaxUsageCount: 25,
    crawleeSessionMaxAgeSecs: 600,
  });
  assert.equal(config.sessionPoolOptions.maxPoolSize, 200);
  assert.equal(config.sessionPoolOptions.sessionOptions.maxUsageCount, 25);
  assert.equal(config.sessionPoolOptions.sessionOptions.maxAgeSecs, 600);
});

// ---------------------------------------------------------------------------
// Fingerprint wiring
// ---------------------------------------------------------------------------

test('fingerprints enabled by default with chrome/windows/desktop', () => {
  const config = captureConfig({});
  assert.equal(config.browserPoolOptions.useFingerprints, true);
  const fpOptions = config.browserPoolOptions.fingerprintOptions;
  assert.ok(fpOptions, 'fingerprintOptions should be present');
  assert.deepStrictEqual(fpOptions.fingerprintGeneratorOptions.browsers, ['chrome']);
  assert.deepStrictEqual(fpOptions.fingerprintGeneratorOptions.operatingSystems, ['windows']);
  assert.deepStrictEqual(fpOptions.fingerprintGeneratorOptions.devices, ['desktop']);
});

test('fingerprints disabled → no fingerprintOptions', () => {
  const config = captureConfig({ crawleeUseFingerprints: false });
  assert.equal(config.browserPoolOptions.useFingerprints, false);
  assert.equal(config.browserPoolOptions.fingerprintOptions, undefined);
});

// ---------------------------------------------------------------------------
// Browser pool optimization (derived maxOpenPagesPerBrowser)
// ---------------------------------------------------------------------------

test('maxOpenPagesPerBrowser is derived from slotCount (capped at 4)', () => {
  // Default slotCount = 4 → maxPages = min(4, 4) = 4
  const config4 = captureConfig({});
  assert.equal(config4.browserPoolOptions.maxOpenPagesPerBrowser, 4);

  // slotCount = 2 → maxPages = min(2, 4) = 2
  const config2 = captureConfig({ crawlMaxConcurrentSlots: 2 });
  assert.equal(config2.browserPoolOptions.maxOpenPagesPerBrowser, 2);

  // slotCount = 16 → maxPages = min(16, 4) = 4
  const config16 = captureConfig({ crawlMaxConcurrentSlots: 16 });
  assert.equal(config16.browserPoolOptions.maxOpenPagesPerBrowser, 4);

  // slotCount = 1 → maxPages = min(1, 4) = 1
  const config1 = captureConfig({ crawlMaxConcurrentSlots: 1 });
  assert.equal(config1.browserPoolOptions.maxOpenPagesPerBrowser, 1);
});

test('incognito pages always enabled for fingerprint isolation', () => {
  const config = captureConfig({});
  assert.equal(config.launchContext.useIncognitoPages, true);
});

// ---------------------------------------------------------------------------
// Optimized defaults (Phase 3: timeout tuning)
// ---------------------------------------------------------------------------

test('optimized defaults are applied', () => {
  const config = captureConfig({});
  assert.equal(config.requestHandlerTimeoutSecs, 45);
  assert.equal(config.navigationTimeoutSecs, 20);
  assert.equal(config.maxRequestRetries, 1);
  assert.equal(config.browserPoolOptions.retireBrowserAfterPageCount, 10);
});

test('navigationTimeoutSecs flows from crawleeNavigationTimeoutSecs setting', () => {
  const config = captureConfig({ crawleeNavigationTimeoutSecs: 30 });
  assert.equal(config.navigationTimeoutSecs, 30);
});

// ---------------------------------------------------------------------------
// Delay handling (Phase 2: blocking sleep, not Crawlee sameDomainDelaySecs)
// ---------------------------------------------------------------------------

test('sameDomainDelaySecs is NOT passed to Crawlee config', () => {
  const config = captureConfig({ crawleeSameDomainDelaySecs: 5 });
  assert.equal(config.sameDomainDelaySecs, undefined);
});

test('preNavigationHooks are present', () => {
  const config = captureConfig({});
  assert.ok(Array.isArray(config.preNavigationHooks));
  assert.ok(config.preNavigationHooks.length >= 1);
});

test('preNavigationHook does not override gotoOptions timeout', async () => {
  const config = captureConfig({});
  const gotoOptions = { timeout: 99999 };
  const mockPage = { context: () => ({ newCDPSession: async () => ({ on: () => {}, send: async () => {} }) }) };
  await config.preNavigationHooks[0](
    { request: { uniqueKey: 'test-key', userData: {} }, page: mockPage },
    gotoOptions,
  );
  assert.equal(gotoOptions.timeout, 99999, 'timeout must not be overridden by hook');
});

test('preNavigationHook sets waitUntil from crawleeWaitUntil setting', async () => {
  const config = captureConfig({ crawleeWaitUntil: 'load' });
  const gotoOptions = { timeout: 30000 };
  const mockPage = { context: () => ({ newCDPSession: async () => ({ on: () => {}, send: async () => {} }) }) };
  await config.preNavigationHooks[0](
    { request: { uniqueKey: 'test-key', userData: {} }, page: mockPage },
    gotoOptions,
  );
  assert.equal(gotoOptions.waitUntil, 'load', 'waitUntil must reflect the setting value');
});

test('preNavigationHook defaults waitUntil to domcontentloaded when setting is absent', async () => {
  const config = captureConfig({});
  const gotoOptions = { timeout: 30000 };
  const mockPage = { context: () => ({ newCDPSession: async () => ({ on: () => {}, send: async () => {} }) }) };
  await config.preNavigationHooks[0](
    { request: { uniqueKey: 'test-key', userData: {} }, page: mockPage },
    gotoOptions,
  );
  assert.equal(gotoOptions.waitUntil, 'domcontentloaded', 'default waitUntil must be domcontentloaded');
});

test('postNavigationHooks not configured', () => {
  const config = captureConfig({});
  const hooks = config.postNavigationHooks;
  assert.ok(!hooks || hooks.length === 0, 'postNavigationHooks should be absent or empty');
});

// ---------------------------------------------------------------------------
// Proxy removal (Phase 4: no tieredProxyUrls on main crawler)
// ---------------------------------------------------------------------------

test('main crawler has NO proxyConfiguration even with proxy URLs configured', () => {
  const config = captureConfig({
    crawleeProxyUrlsJson: '["http://user:pass@proxy.io:80"]',
  });
  assert.equal(config.proxyConfiguration, undefined, 'main crawler must not have proxyConfiguration');
  assert.deepStrictEqual(config._proxyUrls, ['http://user:pass@proxy.io:80'], '_proxyUrls still populated for retry');
});

// ---------------------------------------------------------------------------
// retryWithProxy contract
// ---------------------------------------------------------------------------

test('session exposes retryWithProxy method', () => {
  const session = createCrawlSession({
    settings: { crawleeProxyUrlsJson: '["http://proxy:80"]' },
    plugins: [],
    _crawlerFactory: () => ({ run: async () => {}, teardown: async () => {} }),
  });
  assert.equal(typeof session.retryWithProxy, 'function');
});

test('retryWithProxy returns empty array when no proxy URLs configured', async () => {
  const session = createCrawlSession({
    settings: {},
    plugins: [],
    _crawlerFactory: () => ({ run: async () => {}, teardown: async () => {} }),
  });
  session.start();
  const result = await session.retryWithProxy(['http://example.com']);
  assert.deepStrictEqual(result, []);
});

test('retryWithProxy returns empty array for empty URL list', async () => {
  const session = createCrawlSession({
    settings: { crawleeProxyUrlsJson: '["http://proxy:80"]' },
    plugins: [],
    _crawlerFactory: () => ({ run: async () => {}, teardown: async () => {} }),
  });
  session.start();
  const result = await session.retryWithProxy([]);
  assert.deepStrictEqual(result, []);
});
