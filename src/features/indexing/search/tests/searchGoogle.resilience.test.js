import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCrawlerFactoryDouble,
  createLoggerSpy,
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

describe('searchGoogle resilience', () => {
  it('returns empty results on a CAPTCHA page and retires the session', async () => {
    const { searchGoogle } = await loadModule();
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
    const { searchGoogle } = await loadModule();
    const { factory } = createGoogleCrawlerFactoryDouble({ shouldThrow: true });

    const out = await searchGoogle({
      query: 'test',
      ...buildGoogleSearchOptions(factory),
    });

    assert.deepEqual(out.results, []);
  });
});
