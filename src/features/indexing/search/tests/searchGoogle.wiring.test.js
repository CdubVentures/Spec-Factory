import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCrawlerFactoryDouble,
  createPacerDouble,
} from './factories/searchProviderTestDoubles.js';

async function loadModule() {
  return import('../searchGoogle.js');
}

function buildGoogleSearchOptions(factory, overrides = {}) {
  const { pacer } = createPacerDouble();

  return {
    _crawlerFactory: factory,
    _pacer: pacer,
    minQueryIntervalMs: 0,
    postResultsDelayMs: 0,
    screenshotsEnabled: false,
    ...overrides,
  };
}

describe('searchGoogle wiring', () => {
  it('passes proxyUrls to ProxyConfiguration when non-empty', async () => {
    const { searchGoogle } = await loadModule();
    const { factory, calls } = createGoogleCrawlerFactoryDouble();

    await searchGoogle({
      query: 'test',
      proxyUrls: ['http://user:pass@proxy1:80', 'http://user:pass@proxy2:80'],
      ...buildGoogleSearchOptions(factory),
    });

    assert.deepEqual(calls.proxyConfig?.proxyUrls, [
      'http://user:pass@proxy1:80',
      'http://user:pass@proxy2:80',
    ]);
  });

  it('does not create ProxyConfiguration when proxyUrls is empty', async () => {
    const { searchGoogle } = await loadModule();
    const { factory, calls } = createGoogleCrawlerFactoryDouble();

    await searchGoogle({
      query: 'test',
      proxyUrls: [],
      ...buildGoogleSearchOptions(factory),
    });

    assert.equal(calls.proxyConfig, null);
  });

  it('wires the crawler with the expected headless and retry options', async () => {
    const { searchGoogle } = await loadModule();
    const { factory, calls } = createGoogleCrawlerFactoryDouble();

    await searchGoogle({
      query: 'test',
      ...buildGoogleSearchOptions(factory),
    });

    assert.equal(calls.crawlerOptions?.launchContext?.launchOptions?.headless, true);
    assert.equal(calls.crawlerOptions?.retryOnBlocked, true);
    assert.equal(calls.crawlerOptions?.persistCookiesPerSession, true);
  });

  it('uses the expected Google URL shape and Chrome launch flags', async () => {
    const { searchGoogle } = await loadModule();
    const { factory, calls } = createGoogleCrawlerFactoryDouble();

    await searchGoogle({
      query: 'test query',
      ...buildGoogleSearchOptions(factory),
    });

    const requestUrl = calls.requestListSources?.[0]?.url ?? '';
    const args = calls.crawlerOptions?.launchContext?.launchOptions?.args ?? [];

    assert.ok(requestUrl.includes('udm=14'), `expected udm=14 in ${requestUrl}`);
    assert.ok(!requestUrl.includes('num='), `expected num to be absent in ${requestUrl}`);
    assert.ok(args.includes('--disable-background-networking'));
  });

  it('uses the modern Windows Chrome fingerprint preset', async () => {
    const { searchGoogle } = await loadModule();
    const { factory, calls } = createGoogleCrawlerFactoryDouble();

    await searchGoogle({
      query: 'test',
      ...buildGoogleSearchOptions(factory),
    });

    const options =
      calls.crawlerOptions?.browserPoolOptions?.fingerprintOptions?.fingerprintGeneratorOptions;

    assert.ok(options);
    assert.equal(options.slim, undefined);
  });
});
