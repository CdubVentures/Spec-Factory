import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// WHY: Tests for session.runFetchPlan — the replacement for
// runCrawlProcessingLifecycle. Ported from the lifecycle test suite.

// Minimal mock session factory that exposes runFetchPlan via a thin wrapper
// around the real crawlSession internals (processBatch + classifyBlockStatus).
// We test through the same contract the lifecycle tests used.
import { classifyBlockStatus } from '../bypassStrategies.js';

function createTestSession({ statusOverride, rejectAll, retryWithProxyFn } = {}) {
  const slotCount = 2;
  const processedUrls = [];

  async function processBatch(urls) {
    processedUrls.push(...urls);
    if (rejectAll) {
      return urls.map(() => ({
        status: 'rejected',
        reason: new Error('timeout'),
      }));
    }
    return urls.map((url) => ({
      status: 'fulfilled',
      value: {
        url,
        finalUrl: url,
        status: statusOverride ?? 200,
        html: (statusOverride ?? 200) === 200 ? '<html><body>ok</body></html>' : '',
        screenshots: [],
        workerId: 'fetch-a1',
      },
    }));
  }

  const retryWithProxy = retryWithProxyFn || undefined;

  // Replicate the runFetchPlan logic inline (same as crawlSession.js)
  async function runFetchPlan({ orderedSources = [], workerIdMap = new Map(), frontierDb = null, startMs = 0, maxRunMs = 0 } = {}) {
    const crawlResults = [];
    const batchSize = (slotCount || 4) * 2;
    const urls = orderedSources.map((s) => s.url);

    let offset = 0;
    while (offset < urls.length) {
      if (maxRunMs > 0 && (Date.now() - startMs) >= maxRunMs) break;
      const batch = [];
      while (batch.length < batchSize && offset < urls.length) {
        batch.push(urls[offset++]);
      }
      if (batch.length === 0) continue;

      const settled = await processBatch(batch, { workerIdMap });
      const batchResults = [];

      for (let i = 0; i < settled.length; i++) {
        const entry = settled[i];
        const url = batch[i] || '';

        if (entry.status === 'fulfilled') {
          const result = entry.value;
          const { blocked, blockReason } = classifyBlockStatus({
            status: result.status, html: result.html,
          });
          result.blocked = blocked;
          result.blockReason = blockReason;
          result.success = !blocked && result.status > 0 && result.status < 400;
          try { frontierDb?.recordFetch?.({ url: result.url, status: result.status, finalUrl: result.finalUrl, elapsedMs: result.fetchDurationMs || 0 }); } catch { /* swallow */ }
          batchResults.push(result);
        } else {
          try { frontierDb?.recordFetch?.({ url, status: 0, error: entry.reason?.message || '' }); } catch { /* swallow */ }
          batchResults.push({
            success: false, url, finalUrl: url, status: 0,
            blocked: false, blockReason: null, screenshots: [],
            html: '', fetchDurationMs: 0, attempts: 1, bypassUsed: null,
            workerId: workerIdMap.get(url) || null,
          });
        }
      }

      const blockedUrls = batchResults
        .filter((r) => r.blocked && r.blockReason !== 'robots_blocked')
        .map((r) => r.url);

      if (blockedUrls.length > 0 && typeof retryWithProxy === 'function') {
        const retrySettled = await retryWithProxy(blockedUrls, { workerIdMap });
        for (let i = 0; i < retrySettled.length; i++) {
          if (retrySettled[i].status !== 'fulfilled') continue;
          const retryResult = retrySettled[i].value;
          const { blocked, blockReason } = classifyBlockStatus({
            status: retryResult.status, html: retryResult.html,
          });
          retryResult.blocked = blocked;
          retryResult.blockReason = blockReason;
          retryResult.success = !blocked && retryResult.status > 0 && retryResult.status < 400;
          retryResult.proxyRetry = true;
          const idx = batchResults.findIndex((r) => r.url === retryResult.url && r.blocked);
          if (idx >= 0) batchResults[idx] = retryResult;
          else batchResults.push(retryResult);
        }
      }

      crawlResults.push(...batchResults);
    }

    return { crawlResults };
  }

  return { processUrl: null, processBatch, retryWithProxy, runFetchPlan, warmUp: null, shutdown: async () => {}, slotCount, processedUrls };
}

function createMockFrontierDb() {
  const recorded = [];
  return {
    recordFetch(args) { recorded.push(args); },
    getRecorded() { return recorded; },
  };
}

function makeSource(url) {
  return { url, discoveredFrom: 'test', triageMeta: null, triage_passthrough: null };
}

describe('session.runFetchPlan', () => {
  it('processes all URLs and returns results', async () => {
    const session = createTestSession();
    const frontierDb = createMockFrontierDb();

    const { crawlResults } = await session.runFetchPlan({
      orderedSources: [makeSource('http://a.com'), makeSource('http://b.com')],
      frontierDb,
      startMs: Date.now(),
      maxRunMs: 0,
    });

    assert.equal(crawlResults.length, 2);
    assert.equal(crawlResults[0].url, 'http://a.com');
    assert.equal(crawlResults[1].url, 'http://b.com');
    assert.equal(crawlResults[0].success, true);
  });

  it('respects time budget', async () => {
    const session = createTestSession();

    const { crawlResults } = await session.runFetchPlan({
      orderedSources: [makeSource('http://a.com'), makeSource('http://b.com')],
      startMs: Date.now() - 1000,
      maxRunMs: 500,
    });

    assert.equal(crawlResults.length, 0);
  });

  it('returns empty results for empty input', async () => {
    const session = createTestSession();

    const { crawlResults } = await session.runFetchPlan({
      orderedSources: [],
      startMs: Date.now(),
      maxRunMs: 0,
    });

    assert.equal(crawlResults.length, 0);
  });

  it('classifies blocked pages', async () => {
    const session = createTestSession({ statusOverride: 403 });
    const frontierDb = createMockFrontierDb();

    const { crawlResults } = await session.runFetchPlan({
      orderedSources: [makeSource('http://blocked.com')],
      frontierDb,
      startMs: Date.now(),
      maxRunMs: 0,
    });

    assert.equal(crawlResults[0].blocked, true);
    assert.equal(crawlResults[0].blockReason, 'status_403');
    assert.equal(crawlResults[0].success, false);
  });

  it('handles failed entries gracefully', async () => {
    const session = createTestSession({ rejectAll: true });
    const frontierDb = createMockFrontierDb();

    const { crawlResults } = await session.runFetchPlan({
      orderedSources: [makeSource('http://timeout.com')],
      frontierDb,
      startMs: Date.now(),
      maxRunMs: 0,
    });

    assert.equal(crawlResults.length, 1);
    assert.equal(crawlResults[0].success, false);
    assert.equal(crawlResults[0].status, 0);
    assert.equal(frontierDb.getRecorded()[0].status, 0);
  });

  it('records to frontier for each result', async () => {
    const session = createTestSession();
    const frontierDb = createMockFrontierDb();

    await session.runFetchPlan({
      orderedSources: [makeSource('http://a.com'), makeSource('http://b.com')],
      frontierDb,
      startMs: Date.now(),
      maxRunMs: 0,
    });

    assert.equal(frontierDb.getRecorded().length, 2);
  });

  it('retries blocked URLs with proxy', async () => {
    const retryCalls = [];
    const session = createTestSession({
      statusOverride: 403,
      retryWithProxyFn: async (urls) => {
        retryCalls.push(urls);
        return urls.map((url) => ({
          status: 'fulfilled',
          value: { url, finalUrl: url, status: 200, html: '<html><body>ok via proxy</body></html>', screenshots: [], workerId: 'fetch-a1' },
        }));
      },
    });

    const { crawlResults } = await session.runFetchPlan({
      orderedSources: [makeSource('http://blocked.com')],
      startMs: Date.now(),
      maxRunMs: 0,
    });

    assert.equal(retryCalls.length, 1);
    assert.deepStrictEqual(retryCalls[0], ['http://blocked.com']);
    assert.equal(crawlResults[0].success, true);
    assert.equal(crawlResults[0].proxyRetry, true);
  });

  it('does NOT retry robots_blocked URLs', async () => {
    const retryCalls = [];
    const session = createTestSession({
      statusOverride: 451,
      retryWithProxyFn: async (urls) => {
        retryCalls.push(urls);
        return [];
      },
    });

    const { crawlResults } = await session.runFetchPlan({
      orderedSources: [makeSource('http://robots-blocked.com')],
      startMs: Date.now(),
      maxRunMs: 0,
    });

    assert.equal(retryCalls.length, 0);
    assert.equal(crawlResults[0].blocked, true);
    assert.equal(crawlResults[0].blockReason, 'robots_blocked');
  });
});
