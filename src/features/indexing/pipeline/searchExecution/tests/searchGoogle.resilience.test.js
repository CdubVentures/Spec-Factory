import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCrawlerFactoryDouble,
  createLoggerSpy,
} from './factories/searchProviderTestDoubles.js';
import { buildGoogleSearchOptions, loadSearchGoogleModule } from './helpers/googleSearchHarness.js';

describe('searchGoogle resilience', () => {
  it('returns empty results on a CAPTCHA page and retires the session', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory, calls } = createGoogleCrawlerFactoryDouble({
      url: 'https://www.google.com/sorry/index?continue=https://www.google.com/search',
      html: '<html><body>Our systems have detected unusual traffic from your computer</body></html>',
    });
    const { logger, warnCalls } = createLoggerSpy();

    const out = await searchGoogle({
      query: 'test',
      logger,
      ...buildGoogleSearchOptions(factory),
    });

    assert.deepEqual(out.results, []);
    assert.ok(
      warnCalls.some((call) => call.event === 'google_crawlee_captcha_in_handler'),
      'expected in-handler captcha warning',
    );
    assert.equal(calls.sessionRetired, true);
  });

  it('returns empty results on navigation timeout instead of throwing', async () => {
    const { searchGoogle } = await loadSearchGoogleModule();
    const { factory } = createGoogleCrawlerFactoryDouble({ shouldThrow: true });

    const out = await searchGoogle({
      query: 'test',
      ...buildGoogleSearchOptions(factory),
    });

    assert.deepEqual(out.results, []);
  });
});
