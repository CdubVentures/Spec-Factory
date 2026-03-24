import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crawlPage } from '../crawlPage.js';
import {
  createFrontierDbDouble,
  createSessionDouble,
  createThrowingSessionDouble,
} from './factories/crawlTestDoubles.js';

describe('crawlPage resilience', () => {
  it('returns a failure payload and records the error when the session throws', async () => {
    const session = createThrowingSessionDouble(new Error('timeout'));
    const frontierDb = createFrontierDbDouble();

    const result = await crawlPage({
      url: 'http://timeout.com',
      settings: {},
      frontierDb,
      session,
    });

    assert.equal(result.success, false);
    assert.equal(result.blocked, false);
    assert.equal(result.blockReason, null);
    assert.equal(result.status, 0);
    assert.equal(result.html, '');
    assert.deepEqual(frontierDb.getRecorded(), [
      {
        url: 'http://timeout.com',
        status: 0,
        finalUrl: 'http://timeout.com',
        elapsedMs: result.fetchDurationMs,
        error: 'timeout',
      },
    ]);
  });

  it('swallows frontier recording failures so the crawl result still resolves', async () => {
    const frontierDb = {
      recordFetch() {
        throw new Error('frontier_down');
      },
    };

    const result = await crawlPage({
      url: 'http://example.com',
      settings: {},
      frontierDb,
      session: createSessionDouble(),
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 200);
  });
});
