import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleCrawlerFactoryDouble } from './factories/searchProviderTestDoubles.js';
import { buildGoogleSearchOptions, loadSearchGoogleModule } from './helpers/googleSearchHarness.js';

describe('searchGoogle output contract across configuration variants', () => {
  it('returns the same result contract when proxyUrls are provided', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble();

    const out = await searchGoogle({
      query: 'test query',
      proxyUrls: ['http://user:pass@proxy1:80', 'http://user:pass@proxy2:80'],
      ...buildGoogleSearchOptions(factory),
    });

    assert.ok(Array.isArray(out.results));
    assert.ok(out.results.length > 0, 'expected google results');
    assert.ok(out.results.every((row) => row.provider === 'google'));
  });

  it('does not include screenshot metadata when screenshots are disabled', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble();

    const out = await searchGoogle({
      query: 'test query',
      ...buildGoogleSearchOptions(factory, { screenshotsEnabled: false }),
    });

    assert.ok(Array.isArray(out.results));
    assert.equal(out.screenshot, undefined);
  });

  it('returns screenshot metadata when screenshots are enabled', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble({
      evaluateResults: [undefined, { x: 0, y: 0, width: 320, height: 240 }],
    });

    const out = await searchGoogle({
      query: 'test query',
      ...buildGoogleSearchOptions(factory, {
        screenshotsEnabled: true,
        postResultsDelayMs: 0,
      }),
    });

    assert.ok(Array.isArray(out.results));
    assert.ok(out.results.length > 0, 'expected google results');
    assert.ok(Buffer.isBuffer(out.screenshot?.buffer));
    assert.equal(typeof out.screenshot?.bytes, 'number');
    assert.equal(typeof out.screenshot?.queryHash, 'string');
  });
});
