import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SCHEMA } from '../../specDbSchema.js';
import { applyMigrations } from '../../specDbMigrations.js';
import { createArtifactStore } from '../artifactStore.js';
import { SpecDb } from '../../specDb.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  applyMigrations(db);
  return db;
}

function makeStore(db) {
  const stmts = {
    _insertCrawlSource: db.prepare(`
      INSERT OR REPLACE INTO crawl_sources (
        content_hash, category, product_id, run_id, source_url, final_url,
        host, http_status, doc_kind, source_tier, content_type, size_bytes,
        file_path, has_screenshot, has_pdf, has_ldjson, has_dom_snippet, crawled_at
      ) VALUES (
        @content_hash, @category, @product_id, @run_id, @source_url, @final_url,
        @host, @http_status, @doc_kind, @source_tier, @content_type, @size_bytes,
        @file_path, @has_screenshot, @has_pdf, @has_ldjson, @has_dom_snippet, @crawled_at
      )
    `),
    _insertScreenshot: db.prepare(`
      INSERT OR REPLACE INTO source_screenshots (
        screenshot_id, content_hash, category, product_id, run_id, source_url,
        host, selector, format, width, height, size_bytes,
        file_path, captured_at, doc_kind, source_tier
      ) VALUES (
        @screenshot_id, @content_hash, @category, @product_id, @run_id, @source_url,
        @host, @selector, @format, @width, @height, @size_bytes,
        @file_path, @captured_at, @doc_kind, @source_tier
      )
    `),
    _getCrawlSourcesByProduct: db.prepare(`SELECT * FROM crawl_sources WHERE product_id = ? ORDER BY crawled_at DESC`),
    _getCrawlSourcesByRunId: db.prepare(`SELECT * FROM crawl_sources WHERE run_id = ? ORDER BY crawled_at DESC`),
    _getScreenshotsByProduct: db.prepare(`SELECT * FROM source_screenshots WHERE product_id = ? ORDER BY captured_at DESC`),
    _getScreenshotsByRunId: db.prepare(`SELECT * FROM source_screenshots WHERE run_id = ? ORDER BY captured_at DESC`),
    _getCrawlSourceByHash: db.prepare(`SELECT * FROM crawl_sources WHERE content_hash = ? AND product_id = ?`),
    _insertVideo: db.prepare(`
      INSERT OR REPLACE INTO source_videos (
        video_id, content_hash, category, product_id, run_id, source_url,
        host, worker_id, format, width, height, size_bytes,
        duration_ms, file_path, captured_at
      ) VALUES (
        @video_id, @content_hash, @category, @product_id, @run_id, @source_url,
        @host, @worker_id, @format, @width, @height, @size_bytes,
        @duration_ms, @file_path, @captured_at
      )
    `),
    _getVideosByProduct: db.prepare(`SELECT * FROM source_videos WHERE product_id = ? ORDER BY captured_at DESC`),
    _getVideosByRunId: db.prepare(`SELECT * FROM source_videos WHERE run_id = ? ORDER BY captured_at DESC`),
  };
  return createArtifactStore({ db, category: 'mouse', stmts });
}

// --- crawl_sources ---

test('insertCrawlSource inserts and getCrawlSourcesByProduct retrieves', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.insertCrawlSource({
    content_hash: 'abc123',
    product_id: 'mouse-test',
    run_id: 'run-001',
    source_url: 'https://example.com/product',
    host: 'example.com',
    http_status: 200,
    doc_kind: 'product_page',
    source_tier: 1,
    size_bytes: 4096,
    file_path: 'artifacts/mouse/mouse-test/sources/abc123/page.html.gz',
    crawled_at: '2026-03-27T00:00:00Z',
  });
  const rows = store.getCrawlSourcesByProduct('mouse-test');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].content_hash, 'abc123');
  assert.equal(rows[0].source_url, 'https://example.com/product');
  assert.equal(rows[0].file_path, 'artifacts/mouse/mouse-test/sources/abc123/page.html.gz');
  db.close();
});

test('run-scoped artifact readers return only rows for the requested run', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.insertCrawlSource({ content_hash: 'run-a-source', product_id: 'p1', run_id: 'run-a', source_url: 'https://a.example.com', crawled_at: '2026-03-27T00:00:00Z' });
  store.insertCrawlSource({ content_hash: 'run-b-source', product_id: 'p1', run_id: 'run-b', source_url: 'https://b.example.com', crawled_at: '2026-03-28T00:00:00Z' });
  store.insertScreenshot({ screenshot_id: 'run-a-shot', content_hash: 'run-a-source', product_id: 'p1', run_id: 'run-a', source_url: 'https://a.example.com', size_bytes: 100 });
  store.insertScreenshot({ screenshot_id: 'run-b-shot', content_hash: 'run-b-source', product_id: 'p1', run_id: 'run-b', source_url: 'https://b.example.com', size_bytes: 200 });
  store.insertVideo({ video_id: 'run-a-video', content_hash: 'run-a-source', product_id: 'p1', run_id: 'run-a', source_url: 'https://a.example.com', size_bytes: 300 });
  store.insertVideo({ video_id: 'run-b-video', content_hash: 'run-b-source', product_id: 'p1', run_id: 'run-b', source_url: 'https://b.example.com', size_bytes: 400 });

  assert.deepEqual(store.getCrawlSourcesByRunId('run-a').map((row) => row.content_hash), ['run-a-source']);
  assert.deepEqual(store.getScreenshotsByRunId('run-a').map((row) => row.screenshot_id), ['run-a-shot']);
  assert.deepEqual(store.getVideosByRunId('run-a').map((row) => row.video_id), ['run-a-video']);
  db.close();
});

test('getCrawlSourceByHash returns existing source for dedup check', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.insertCrawlSource({
    content_hash: 'dedup-hash',
    product_id: 'mouse-test',
    run_id: 'run-001',
    source_url: 'https://example.com',
    crawled_at: '2026-03-27T00:00:00Z',
  });
  const found = store.getCrawlSourceByHash('dedup-hash', 'mouse-test');
  assert.ok(found, 'should find existing source');
  assert.equal(found.content_hash, 'dedup-hash');
  const notFound = store.getCrawlSourceByHash('missing-hash', 'mouse-test');
  assert.equal(notFound, undefined);
  db.close();
});

test('insertCrawlSource upserts on same content_hash + product_id', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.insertCrawlSource({ content_hash: 'dup', product_id: 'p1', run_id: 'r1', source_url: 'url1', crawled_at: 'ts1' });
  store.insertCrawlSource({ content_hash: 'dup', product_id: 'p1', run_id: 'r2', source_url: 'url2', crawled_at: 'ts2' });
  const rows = store.getCrawlSourcesByProduct('p1');
  assert.equal(rows.length, 1, 'should upsert, not duplicate');
  assert.equal(rows[0].run_id, 'r2', 'should have latest run_id');
  db.close();
});

test('run source projection preserves duplicate content_hash provenance across runs', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.insertCrawlSource({
    content_hash: 'dup-run-hash',
    product_id: 'p1',
    run_id: 'run-1',
    source_url: 'https://first.example.com',
    crawled_at: '2026-03-27T00:00:00Z',
  });
  specDb.insertCrawlSource({
    content_hash: 'dup-run-hash',
    product_id: 'p1',
    run_id: 'run-2',
    source_url: 'https://second.example.com',
    crawled_at: '2026-03-28T00:00:00Z',
  });

  assert.equal(specDb.getCrawlSourcesByProduct('p1').length, 1, 'crawl_sources remains product-hash deduped');
  assert.deepEqual(
    specDb.getRunSourcesByRunId('run-1').map((row) => row.source_url),
    ['https://first.example.com'],
  );
  assert.deepEqual(
    specDb.getRunSourcesByRunId('run-2').map((row) => row.source_url),
    ['https://second.example.com'],
  );
  specDb.db.close();
});

test('run source pagination returns SQL page and total count', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  for (let i = 0; i < 5; i += 1) {
    specDb.insertRunSource({
      run_id: 'run-page',
      content_hash: `page-hash-${i}`,
      product_id: 'p-page',
      source_url: `https://example.com/page-${i}`,
      crawled_at: `2026-03-2${i}T00:00:00Z`,
    });
  }

  const page = specDb.getRunSourcesPageByRunId('run-page', { limit: 2, offset: 1 });
  assert.deepEqual(page.map((row) => row.source_url), [
    'https://example.com/page-3',
    'https://example.com/page-2',
  ]);
  assert.equal(specDb.countRunSourcesByRunId('run-page'), 5);
  specDb.db.close();
});

test('indexed URL history projects run-scoped source rows for seed planning', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.insertRunSource({
    run_id: 'run-history-1',
    content_hash: 'history-hash-1',
    product_id: 'p-history',
    source_url: 'https://history.example.com/a',
    final_url: 'https://history.example.com/final-a',
    crawled_at: '2026-03-28T00:00:00Z',
  });
  specDb.insertRunSource({
    run_id: 'run-history-2',
    content_hash: 'history-hash-2',
    product_id: 'p-history',
    source_url: 'https://history.example.com/b',
    crawled_at: '2026-03-29T00:00:00Z',
  });

  const rows = specDb.getIndexedUrlHistoryByProduct('p-history');
  assert.deepEqual(rows.map((row) => ({
    run_id: row.run_id,
    product_id: row.product_id,
    url: row.url,
    last_crawled_at: row.last_crawled_at,
  })), [
    {
      run_id: 'run-history-2',
      product_id: 'p-history',
      url: 'https://history.example.com/b',
      last_crawled_at: '2026-03-29T00:00:00Z',
    },
    {
      run_id: 'run-history-1',
      product_id: 'p-history',
      url: 'https://history.example.com/a',
      last_crawled_at: '2026-03-28T00:00:00Z',
    },
  ]);
  specDb.db.close();
});

// --- source_screenshots ---

test('insertScreenshot inserts and getScreenshotsByProduct retrieves', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.insertScreenshot({
    screenshot_id: 'shot-001',
    content_hash: 'page-hash',
    product_id: 'mouse-test',
    run_id: 'run-001',
    source_url: 'https://example.com',
    host: 'example.com',
    selector: 'fullpage',
    format: 'jpg',
    width: 1920,
    height: 1080,
    size_bytes: 50000,
    file_path: 'artifacts/mouse/mouse-test/sources/page-hash/screenshot.jpg',
    captured_at: '2026-03-27T00:00:00Z',
  });
  const rows = store.getScreenshotsByProduct('mouse-test');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].screenshot_id, 'shot-001');
  assert.equal(rows[0].width, 1920);
  assert.equal(rows[0].format, 'jpg');
  db.close();
});

// --- specDb public delegation ---

test('specDb.insertScreenshot delegates to artifactStore', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.insertScreenshot({
    screenshot_id: 'delegate-shot-001',
    content_hash: 'delegate-hash',
    product_id: 'mouse-test',
    run_id: 'run-001',
    source_url: 'https://example.com',
    host: 'example.com',
    selector: 'fullpage',
    format: 'jpg',
    width: 1920,
    height: 1080,
    size_bytes: 50000,
    file_path: 'screenshots/test.jpg',
    captured_at: '2026-03-27T00:00:00Z',
  });
  const rows = specDb.getScreenshotsByProduct('mouse-test');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].screenshot_id, 'delegate-shot-001');
  assert.equal(rows[0].content_hash, 'delegate-hash');
  specDb.db.close();
});

test('specDb.insertCrawlSource delegates to artifactStore', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.insertCrawlSource({
    content_hash: 'delegate-crawl-hash',
    product_id: 'mouse-test',
    run_id: 'run-001',
    source_url: 'https://example.com',
    host: 'example.com',
    crawled_at: '2026-03-27T00:00:00Z',
  });
  const rows = specDb.getCrawlSourcesByProduct('mouse-test');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].content_hash, 'delegate-crawl-hash');
  specDb.db.close();
});

test('specDb.getCrawlSourceByHash delegates to artifactStore', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.insertCrawlSource({
    content_hash: 'lookup-hash',
    product_id: 'mouse-test',
    run_id: 'run-001',
    source_url: 'https://example.com',
    crawled_at: '2026-03-27T00:00:00Z',
  });
  const found = specDb.getCrawlSourceByHash('lookup-hash', 'mouse-test');
  assert.ok(found);
  assert.equal(found.content_hash, 'lookup-hash');
  const missing = specDb.getCrawlSourceByHash('no-such-hash', 'mouse-test');
  assert.equal(missing, undefined);
  specDb.db.close();
});

