import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCrawlerFactoryDouble,
  createPacerDouble,
} from './factories/searchProviderTestDoubles.js';

async function loadModule() {
  return import('../searchGoogle.js');
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('searchGoogle screenshots', () => {
  it('returns screenshot metadata when screenshotsEnabled is true', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });

    try {
      const { searchGoogle } = await loadModule();
      const { pacer } = createPacerDouble();
      const fakeBuffer = Buffer.alloc(1024, 0xff);
      const { factory } = createGoogleCrawlerFactoryDouble({ screenshotBuffer: fakeBuffer });

      const searchPromise = searchGoogle({
        query: 'test screenshot',
        _crawlerFactory: factory,
        _pacer: pacer,
        minQueryIntervalMs: 0,
        postResultsDelayMs: 0,
        screenshotsEnabled: true,
      });

      await flushAsyncWork();
      mock.timers.tick(1000);
      await flushAsyncWork();

      const out = await searchPromise;

      assert.ok(out.screenshot);
      assert.ok(Buffer.isBuffer(out.screenshot.buffer));
      assert.equal(out.screenshot.bytes, fakeBuffer.length);
      assert.ok(out.screenshot.ts);
      assert.ok(out.screenshot.queryHash);
    } finally {
      mock.timers.reset();
    }
  });

  it('does not return screenshot metadata when screenshotsEnabled is false', async () => {
    const { searchGoogle } = await loadModule();
    const { pacer } = createPacerDouble();
    const { factory } = createGoogleCrawlerFactoryDouble();

    const out = await searchGoogle({
      query: 'test no screenshot',
      _crawlerFactory: factory,
      _pacer: pacer,
      minQueryIntervalMs: 0,
      postResultsDelayMs: 0,
      screenshotsEnabled: false,
    });

    assert.equal(out.screenshot, undefined);
  });
});
