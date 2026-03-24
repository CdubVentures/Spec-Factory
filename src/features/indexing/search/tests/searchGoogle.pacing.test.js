import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCrawlerFactoryDouble,
  createPacerDouble,
  createRequestThrottlerDouble,
} from './factories/searchProviderTestDoubles.js';

async function loadModule() {
  return import('../searchGoogle.js');
}

describe('searchGoogle pacing and throttling', () => {
  it('delegates pacing to the injected pacer instead of relying on wall-clock assertions', async () => {
    const { searchGoogle } = await loadModule();
    const { factory } = createGoogleCrawlerFactoryDouble();
    const { pacer, waitCalls } = createPacerDouble();

    await searchGoogle({
      query: 'first',
      _crawlerFactory: factory,
      _pacer: pacer,
      minQueryIntervalMs: 200,
      postResultsDelayMs: 0,
      screenshotsEnabled: false,
    });

    assert.deepEqual(waitCalls, [{ interval: 200, jitterFactor: 0.3 }]);
  });

  it('acquires the request throttler when provided', async () => {
    const { searchGoogle } = await loadModule();
    const { factory } = createGoogleCrawlerFactoryDouble();
    const { pacer } = createPacerDouble();
    const { requestThrottler, acquireCalls } = createRequestThrottlerDouble();

    await searchGoogle({
      query: 'second',
      _crawlerFactory: factory,
      _pacer: pacer,
      requestThrottler,
      minQueryIntervalMs: 0,
      postResultsDelayMs: 0,
      screenshotsEnabled: false,
    });

    assert.deepEqual(acquireCalls, [
      { key: 'www.google.com', provider: 'google', query: 'second' },
    ]);
  });
});
