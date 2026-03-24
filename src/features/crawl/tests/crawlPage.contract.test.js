import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crawlPage } from '../crawlPage.js';
import {
  createFrontierDbDouble,
  createSessionDouble,
} from './factories/crawlTestDoubles.js';

const CRAWL_PAGE_KEYS = [
  'attempts',
  'blockReason',
  'blocked',
  'bypassUsed',
  'fetchDurationMs',
  'finalUrl',
  'html',
  'screenshots',
  'status',
  'success',
  'url',
];

describe('crawlPage contract', () => {
  it('returns the documented payload and records successful fetches', async () => {
    const screenshots = [
      {
        kind: 'page',
        format: 'jpeg',
        bytes: Buffer.from('img'),
        captured_at: new Date().toISOString(),
      },
    ];
    const session = createSessionDouble({ result: { screenshots } });
    const frontierDb = createFrontierDbDouble();

    const result = await crawlPage({
      url: 'http://example.com/product',
      settings: {},
      frontierDb,
      session,
    });

    assert.deepEqual(Object.keys(result).sort(), CRAWL_PAGE_KEYS);
    assert.equal(result.success, true);
    assert.equal(result.url, 'http://example.com/product');
    assert.equal(result.finalUrl, 'http://example.com/product');
    assert.equal(result.status, 200);
    assert.equal(result.blocked, false);
    assert.equal(result.blockReason, null);
    assert.equal(result.attempts, 1);
    assert.equal(result.bypassUsed, null);
    assert.equal(result.screenshots.length, 1);
    assert.ok(result.fetchDurationMs >= 0);

    assert.deepEqual(frontierDb.getRecorded(), [
      {
        url: 'http://example.com/product',
        status: 200,
        finalUrl: 'http://example.com/product',
        elapsedMs: result.fetchDurationMs,
        error: '',
      },
    ]);
  });

  it('classifies blocked responses from the page contract and still records them', async () => {
    const session = createSessionDouble({ result: { status: 403, html: '' } });
    const frontierDb = createFrontierDbDouble();

    const result = await crawlPage({
      url: 'http://blocked.com',
      settings: {},
      frontierDb,
      session,
    });

    assert.equal(result.success, false);
    assert.equal(result.blocked, true);
    assert.equal(result.blockReason, 'status_403');
    assert.equal(frontierDb.getRecorded().length, 1);
    assert.equal(frontierDb.getRecorded()[0].status, 403);
  });

  it('does not require a frontier db to fulfill the crawl contract', async () => {
    const result = await crawlPage({
      url: 'http://example.com',
      settings: {},
      frontierDb: null,
      session: createSessionDouble(),
    });

    assert.equal(result.success, true);
    assert.equal(result.url, 'http://example.com');
  });
});
