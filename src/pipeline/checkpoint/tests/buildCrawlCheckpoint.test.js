import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCrawlCheckpoint } from '../buildCrawlCheckpoint.js';

function makeResult(overrides = {}) {
  return {
    url: 'https://example.com/page',
    finalUrl: 'https://example.com/page',
    status: 200,
    title: 'Test Page',
    html: '<html><body>test</body></html>',
    screenshots: [{ bytes: Buffer.from('img'), width: 100, height: 50 }],
    workerId: 'fetch-1',
    videoPath: '',
    ...overrides,
  };
}

const BASE_OPTS = {
  runId: 'run-001',
  category: 'mouse',
  productId: 'mouse-test-product',
  s3Key: 'specs/inputs/mouse/products/mouse-test-product.json',
  startMs: Date.now() - 5000,
  fetchPlanStats: { total_queued: 5, seed_count: 2, learning_seed_count: 1, approved_count: 2, blocked_count: 0 },
};

describe('buildCrawlCheckpoint — schema', () => {
  test('returns correct schema_version and checkpoint_type', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.schema_version, 2);
    assert.equal(cp.checkpoint_type, 'crawl');
  });

  test('created_at is ISO string', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.match(cp.created_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('run fields propagated', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.run.run_id, 'run-001');
    assert.equal(cp.run.category, 'mouse');
    assert.equal(cp.run.product_id, 'mouse-test-product');
    assert.equal(cp.run.s3_key, BASE_OPTS.s3Key);
    assert.equal(typeof cp.run.duration_ms, 'number');
    assert.ok(cp.run.duration_ms >= 4000);
  });

  test('artifacts has relative directory names', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.artifacts.html_dir, 'html');
    assert.equal(cp.artifacts.screenshot_dir, 'screenshots');
    assert.equal(cp.artifacts.video_dir, 'video');
  });
});

describe('buildCrawlCheckpoint — sources', () => {
  test('happy path: 2 successful URLs', () => {
    const results = [makeResult(), makeResult({ url: 'https://other.com', finalUrl: 'https://other.com' })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources.length, 2);
    assert.equal(cp.counters.urls_crawled, 2);
    assert.equal(cp.counters.urls_successful, 2);
    assert.equal(cp.counters.urls_blocked, 0);
    assert.equal(cp.counters.urls_failed, 0);
  });

  test('empty crawlResults', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.deepEqual(cp.sources, []);
    assert.equal(cp.counters.urls_crawled, 0);
    assert.equal(cp.counters.urls_successful, 0);
  });

  test('null crawlResults defaults to empty', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: null });
    assert.deepEqual(cp.sources, []);
  });

  test('blocked URL has block_reason and success: false', () => {
    const results = [makeResult({ blocked: true, blockReason: 'status_403', html: '' })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources[0].blocked, true);
    assert.equal(cp.sources[0].block_reason, 'status_403');
    assert.equal(cp.sources[0].success, false);
    assert.equal(cp.counters.urls_blocked, 1);
    assert.equal(cp.counters.urls_successful, 0);
  });

  test('timeout-rescued URL', () => {
    const results = [makeResult({ timeoutRescued: true, fetchError: 'handler timeout' })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources[0].timeout_rescued, true);
    assert.equal(cp.sources[0].fetch_error, 'handler timeout');
    assert.equal(cp.counters.urls_timeout_rescued, 1);
  });

  test('failed URL with fetchError', () => {
    const results = [makeResult({ html: '', fetchError: 'ERR_NAME_NOT_RESOLVED' })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources[0].fetch_error, 'ERR_NAME_NOT_RESOLVED');
    assert.equal(cp.sources[0].success, false);
    assert.equal(cp.counters.urls_failed, 1);
  });

  test('mixed results: success + blocked + failed', () => {
    const results = [
      makeResult(),
      makeResult({ blocked: true, blockReason: 'captcha_detected', html: '' }),
      makeResult({ html: '', fetchError: 'timeout' }),
    ];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.counters.urls_crawled, 3);
    assert.equal(cp.counters.urls_successful, 1);
    assert.equal(cp.counters.urls_blocked, 1);
    assert.equal(cp.counters.urls_failed, 1);
  });
});

describe('buildCrawlCheckpoint — content hash derivation', () => {
  test('URL with HTML has content_hash and html_file', () => {
    const results = [makeResult({ html: '<html>content</html>' })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    const src = cp.sources[0];
    assert.equal(typeof src.content_hash, 'string');
    assert.equal(src.content_hash.length, 64);
    assert.match(src.content_hash, /^[0-9a-f]{64}$/);
    assert.equal(src.html_file, `${src.content_hash.slice(0, 12)}.html.gz`);
  });

  test('URL with empty HTML has null content_hash and html_file', () => {
    const results = [makeResult({ html: '' })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources[0].content_hash, null);
    assert.equal(cp.sources[0].html_file, null);
  });

  test('deterministic: same HTML produces same hash', () => {
    const html = '<html>deterministic test</html>';
    const cp1 = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [makeResult({ html })] });
    const cp2 = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [makeResult({ html })] });
    assert.equal(cp1.sources[0].content_hash, cp2.sources[0].content_hash);
  });
});

describe('buildCrawlCheckpoint — artifact references', () => {
  test('screenshot_count from result.screenshots.length', () => {
    const results = [makeResult({ screenshots: [{}, {}, {}] })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources[0].screenshot_count, 3);
  });

  test('screenshot_count is 0 for empty screenshots', () => {
    const results = [makeResult({ screenshots: [] })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources[0].screenshot_count, 0);
  });

  test('video_file derived from workerId', () => {
    const results = [makeResult({ workerId: 'fetch-3' })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources[0].video_file, 'fetch-3.webm');
  });

  test('video_file is null when workerId missing', () => {
    const results = [makeResult({ workerId: '' })];
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: results });
    assert.equal(cp.sources[0].video_file, null);
  });
});

describe('buildCrawlCheckpoint — fetch plan stats', () => {
  test('fetchPlanStats propagated', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.fetch_plan.total_queued, 5);
    assert.equal(cp.fetch_plan.seed_count, 2);
    assert.equal(cp.fetch_plan.learning_seed_count, 1);
    assert.equal(cp.fetch_plan.approved_count, 2);
    assert.equal(cp.fetch_plan.blocked_count, 0);
  });

  test('missing fetchPlanStats defaults to zeros', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [], fetchPlanStats: undefined });
    assert.equal(cp.fetch_plan.total_queued, 0);
    assert.equal(cp.fetch_plan.seed_count, 0);
  });
});

describe('buildCrawlCheckpoint — bridge data (v2 fields)', () => {
  test('needset included when provided', () => {
    const needset = { total_fields: 10, fields: [{ field_key: 'weight', state: 'needed' }] };
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [], needset });
    assert.deepEqual(cp.needset, needset);
  });

  test('needset is null when not provided', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.needset, null);
  });

  test('searchProfile included when provided', () => {
    const searchProfile = { status: 'complete', query_rows: [{ query: 'test' }] };
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [], searchProfile });
    assert.deepEqual(cp.search_profile, searchProfile);
  });

  test('searchProfile is null when not provided', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.search_profile, null);
  });

  test('runSummary included when provided', () => {
    const runSummary = { schema_version: 3, telemetry: { meta: {}, events: [], llm_agg: {} } };
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [], runSummary });
    assert.deepEqual(cp.run_summary, runSummary);
  });

  test('runSummary is null when not provided', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.run_summary, null);
  });

  test('status defaults to completed', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.run.status, 'completed');
  });

  test('status propagated when provided', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [], status: 'failed' });
    assert.equal(cp.run.status, 'failed');
  });

  test('identityLock propagated when provided', () => {
    const identityLock = { brand: 'Razer', model: 'Viper V3 Pro', variant: '', sku: '', title: 'Razer Viper V3 Pro' };
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [], identityLock });
    assert.equal(cp.identity.brand, 'Razer');
    assert.equal(cp.identity.model, 'Viper V3 Pro');
    assert.equal(cp.identity.title, 'Razer Viper V3 Pro');
  });

  test('identityLock defaults to empty fields', () => {
    const cp = buildCrawlCheckpoint({ ...BASE_OPTS, crawlResults: [] });
    assert.equal(cp.identity.brand, '');
    assert.equal(cp.identity.model, '');
    assert.equal(cp.identity.variant, '');
  });
});
