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
    _insertPdf: db.prepare(`
      INSERT OR REPLACE INTO source_pdfs (
        pdf_id, content_hash, parent_content_hash, category, product_id, run_id,
        source_url, host, filename, size_bytes, file_path,
        pages_scanned, tables_found, pair_count, crawled_at
      ) VALUES (
        @pdf_id, @content_hash, @parent_content_hash, @category, @product_id, @run_id,
        @source_url, @host, @filename, @size_bytes, @file_path,
        @pages_scanned, @tables_found, @pair_count, @crawled_at
      )
    `),
    _getCrawlSourcesByProduct: db.prepare(`SELECT * FROM crawl_sources WHERE product_id = ? ORDER BY crawled_at DESC`),
    _getScreenshotsByProduct: db.prepare(`SELECT * FROM source_screenshots WHERE product_id = ? ORDER BY captured_at DESC`),
    _getCrawlSourceByHash: db.prepare(`SELECT * FROM crawl_sources WHERE content_hash = ? AND product_id = ?`),
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

// --- source_pdfs ---

test('insertPdf inserts and is queryable', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.insertPdf({
    pdf_id: 'pdf-001',
    content_hash: 'pdf-hash',
    parent_content_hash: 'page-hash',
    product_id: 'mouse-test',
    run_id: 'run-001',
    source_url: 'https://example.com/datasheet.pdf',
    host: 'example.com',
    filename: 'datasheet.pdf',
    size_bytes: 200000,
    file_path: 'artifacts/mouse/mouse-test/sources/page-hash/datasheet.pdf',
    pages_scanned: 5,
    tables_found: 2,
    pair_count: 30,
    crawled_at: '2026-03-27T00:00:00Z',
  });
  const row = db.prepare('SELECT * FROM source_pdfs WHERE pdf_id = ?').get('pdf-001');
  assert.ok(row);
  assert.equal(row.filename, 'datasheet.pdf');
  assert.equal(row.pages_scanned, 5);
  db.close();
});

// --- specDb public delegation (Step 0: fix broken public API) ---

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

test('specDb.insertPdf delegates to artifactStore', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.insertPdf({
    pdf_id: 'delegate-pdf-001',
    content_hash: 'pdf-hash',
    parent_content_hash: 'page-hash',
    product_id: 'mouse-test',
    run_id: 'run-001',
    source_url: 'https://example.com/doc.pdf',
    host: 'example.com',
    filename: 'doc.pdf',
    size_bytes: 100000,
    file_path: 'pdfs/doc.pdf',
    crawled_at: '2026-03-27T00:00:00Z',
  });
  const row = specDb.db.prepare('SELECT * FROM source_pdfs WHERE pdf_id = ?').get('delegate-pdf-001');
  assert.ok(row);
  assert.equal(row.filename, 'doc.pdf');
  specDb.db.close();
});
