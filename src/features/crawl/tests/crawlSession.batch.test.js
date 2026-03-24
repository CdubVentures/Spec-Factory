import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';
import { createCrawlerFactoryDouble } from './factories/crawlTestDoubles.js';

describe('createCrawlSession batch processing', () => {
  it('processBatch resolves one settled result per URL in a single crawler run', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: { crawlSessionCount: 2 },
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    const settled = await session.processBatch([
      'http://a.com',
      'http://b.com',
      'http://c.com',
    ]);

    assert.equal(settled.length, 3);
    assert.equal(settled[0].status, 'fulfilled');
    assert.equal(settled[1].status, 'fulfilled');
    assert.equal(settled[2].status, 'fulfilled');
    assert.equal(settled[0].value.url, 'http://a.com');
    assert.deepEqual(crawler.getProcessedUrls(), [
      'http://a.com',
      'http://b.com',
      'http://c.com',
    ]);
  });

  it('assigns a unique worker id to each batch result', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: { crawlSessionCount: 2 },
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    const settled = await session.processBatch([
      'http://a.com',
      'http://b.com',
    ]);

    const workerIds = settled
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => entry.value.workerId);

    assert.equal(workerIds.length, 2);
    assert.notEqual(workerIds[0], workerIds[1]);
    assert.match(workerIds[0], /^fetch-\d+$/);
    assert.match(workerIds[1], /^fetch-\d+$/);
  });
});
