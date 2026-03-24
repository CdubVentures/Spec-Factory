import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawleeAdapter } from '../crawleeAdapter.js';

describe('createCrawleeAdapter', () => {
  it('returns a session object with the standard interface', () => {
    // WHY: _crawlerFactory DI seam prevents real Playwright launch.
    const mockCrawler = {
      run: async () => {},
      addRequests: async () => {},
    };
    const session = createCrawleeAdapter({
      settings: { crawlSessionCount: 1 },
      plugins: [],
      logger: null,
      _crawlerFactory: () => mockCrawler,
    });

    assert.equal(typeof session.start, 'function');
    assert.equal(typeof session.processUrl, 'function');
    assert.equal(typeof session.processBatch, 'function');
    assert.equal(typeof session.shutdown, 'function');
    assert.equal(typeof session.slotCount, 'number');
  });
});
