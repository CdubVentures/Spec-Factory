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
// Optimized defaults
// ---------------------------------------------------------------------------

test('optimized defaults are applied', () => {
  const config = captureConfig({});
  assert.equal(config.requestHandlerTimeoutSecs, 45);
  assert.equal(config.maxRequestRetries, 3);
  assert.equal(config.browserPoolOptions.retireBrowserAfterPageCount, 10);
});
