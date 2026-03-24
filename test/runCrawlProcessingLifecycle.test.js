import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCrawlProcessingLifecycle } from '../src/pipeline/runCrawlProcessingLifecycle.js';

function createMockPlanner(urls) {
  let idx = 0;
  return {
    hasNext() { return idx < urls.length; },
    next() { return urls[idx++]; },
  };
}

function createMockSession(statusOverride) {
  return {
    slotCount: 2,
    async processBatch(urls) {
      return urls.map((url) => ({
        status: 'fulfilled',
        value: {
          url,
          finalUrl: url,
          status: statusOverride ?? 200,
          html: '<html><body>ok</body></html>',
          screenshots: [],
          workerId: 'fetch-a1',
        },
      }));
    },
  };
}

function createMockFrontierDb(skipUrls = new Set()) {
  const recorded = [];
  return {
    shouldSkipUrl(url) {
      return skipUrls.has(url)
        ? { skip: true, reason: 'cooldown' }
        : { skip: false, reason: null };
    },
    recordFetch(args) { recorded.push(args); },
    getRecorded() { return recorded; },
  };
}

describe('runCrawlProcessingLifecycle', () => {
  it('drains planner queue in batches and returns all results', async () => {
    const planner = createMockPlanner([
      { url: 'http://a.com' },
      { url: 'http://b.com' },
    ]);
    const session = createMockSession();
    const frontierDb = createMockFrontierDb();

    const { crawlResults } = await runCrawlProcessingLifecycle({
      planner, session, frontierDb, settings: {}, startMs: Date.now(), maxRunMs: 0,
    });

    assert.equal(crawlResults.length, 2);
    assert.equal(crawlResults[0].url, 'http://a.com');
    assert.equal(crawlResults[1].url, 'http://b.com');
    assert.equal(crawlResults[0].success, true);
  });

  it('skips URLs on frontier cooldown', async () => {
    const planner = createMockPlanner([
      { url: 'http://hot.com' },
      { url: 'http://cool.com' },
    ]);
    const session = createMockSession();
    const frontierDb = createMockFrontierDb(new Set(['http://cool.com']));

    const { crawlResults } = await runCrawlProcessingLifecycle({
      planner, session, frontierDb, settings: {}, startMs: Date.now(), maxRunMs: 0,
    });

    assert.equal(crawlResults.length, 1);
    assert.equal(crawlResults[0].url, 'http://hot.com');
  });

  it('respects time budget', async () => {
    const planner = createMockPlanner([
      { url: 'http://a.com' },
      { url: 'http://b.com' },
    ]);
    const session = createMockSession();
    const frontierDb = createMockFrontierDb();

    const { crawlResults } = await runCrawlProcessingLifecycle({
      planner, session, frontierDb, settings: {},
      startMs: Date.now() - 1000, maxRunMs: 500,
    });

    assert.equal(crawlResults.length, 0);
  });

  it('returns empty results for empty planner', async () => {
    const planner = createMockPlanner([]);
    const session = createMockSession();

    const { crawlResults } = await runCrawlProcessingLifecycle({
      planner, session, settings: {}, startMs: Date.now(), maxRunMs: 0,
    });

    assert.equal(crawlResults.length, 0);
  });

  it('classifies blocked pages from batch results', async () => {
    const session = {
      slotCount: 1,
      async processBatch(urls) {
        return urls.map((url) => ({
          status: 'fulfilled',
          value: { url, finalUrl: url, status: 403, html: '', screenshots: [], workerId: 'fetch-a1' },
        }));
      },
    };
    const planner = createMockPlanner([{ url: 'http://blocked.com' }]);
    const frontierDb = createMockFrontierDb();

    const { crawlResults } = await runCrawlProcessingLifecycle({
      planner, session, frontierDb, settings: {}, startMs: Date.now(), maxRunMs: 0,
    });

    assert.equal(crawlResults[0].blocked, true);
    assert.equal(crawlResults[0].blockReason, 'status_403');
    assert.equal(crawlResults[0].success, false);
  });

  it('handles failed batch entries gracefully', async () => {
    const session = {
      slotCount: 1,
      async processBatch(urls) {
        return urls.map(() => ({
          status: 'rejected',
          reason: new Error('timeout'),
        }));
      },
    };
    const planner = createMockPlanner([{ url: 'http://timeout.com' }]);
    const frontierDb = createMockFrontierDb();

    const { crawlResults } = await runCrawlProcessingLifecycle({
      planner, session, frontierDb, settings: {}, startMs: Date.now(), maxRunMs: 0,
    });

    assert.equal(crawlResults.length, 1);
    assert.equal(crawlResults[0].success, false);
    assert.equal(crawlResults[0].status, 0);
    assert.equal(frontierDb.getRecorded()[0].status, 0);
  });

  it('records to frontier for each result', async () => {
    const planner = createMockPlanner([{ url: 'http://a.com' }, { url: 'http://b.com' }]);
    const session = createMockSession();
    const frontierDb = createMockFrontierDb();

    await runCrawlProcessingLifecycle({
      planner, session, frontierDb, settings: {}, startMs: Date.now(), maxRunMs: 0,
    });

    assert.equal(frontierDb.getRecorded().length, 2);
  });

  it('drains in strict slot→rank order across all queues', async () => {
    // Simulate: manufacturer URL (no slot), then 2 general-queue URLs with slot info
    const planner = createMockPlanner([
      // Manufacturer seed — no triage_passthrough, corsair.com host
      { url: 'http://corsair.com/brand-page', role: 'manufacturer' },
      // General queue — slot b, rank 2
      { url: 'http://versus.com/corsair-m55', triage_passthrough: { search_slot: 'b', search_rank: 2 } },
      // General queue — slot a, rank 3
      { url: 'http://amazon.com/corsair-m55', triage_passthrough: { search_slot: 'a', search_rank: 3 } },
      // General queue — slot a, rank 1 (same host as manufacturer = corsair.com)
      { url: 'http://corsair.com/m55-specs', triage_passthrough: { search_slot: 'a', search_rank: 1 } },
    ]);

    const processedUrls = [];
    const session = {
      slotCount: 4,
      async processBatch(urls) {
        processedUrls.push(...urls);
        return urls.map((url) => ({
          status: 'fulfilled',
          value: { url, finalUrl: url, status: 200, html: '<html><body>ok</body></html>', screenshots: [], workerId: 'w' },
        }));
      },
    };

    await runCrawlProcessingLifecycle({
      planner, session, settings: {}, startMs: Date.now(), maxRunMs: 0,
    });

    // Expected order: a1 (manufacturer via host fallback), a3 (general), b2 (general)
    // corsair.com/brand-page gets host-fallback to slot a (same host as corsair.com/m55-specs)
    assert.deepEqual(processedUrls, [
      'http://corsair.com/brand-page',     // slot a, rank 1 (host fallback from corsair.com)
      'http://corsair.com/m55-specs',      // slot a, rank 1 (exact triage)
      'http://amazon.com/corsair-m55',     // slot a, rank 3
      'http://versus.com/corsair-m55',     // slot b, rank 2
    ]);
  });
});
