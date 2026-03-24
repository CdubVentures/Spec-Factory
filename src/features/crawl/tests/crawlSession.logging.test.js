import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';
import {
  createCrawlerFactoryDouble,
  createLoggerSpy,
} from './factories/crawlTestDoubles.js';

describe('createCrawlSession logging', () => {
  it('emits source_fetch_started and source_processed events for GUI bridge', async () => {
    const crawler = createCrawlerFactoryDouble();
    const { logger, infoCalls } = createLoggerSpy();
    const session = createCrawlSession({
      settings: { crawlSessionCount: 1 },
      plugins: [],
      logger,
      _crawlerFactory: crawler.factory,
    });

    await session.processBatch(['http://test.com']);

    const started = infoCalls.filter((entry) => entry.event === 'source_fetch_started');
    const processed = infoCalls.filter((entry) => entry.event === 'source_processed');

    assert.equal(started.length, 1, 'should emit source_fetch_started');
    assert.equal(processed.length, 1, 'should emit source_processed');
    assert.equal(started[0].url, 'http://test.com');
    assert.ok(started[0].worker_id);
    assert.equal(processed[0].url, 'http://test.com');
    assert.equal(processed[0].status, 200);
  });
});
