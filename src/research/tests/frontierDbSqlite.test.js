import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { FrontierDbSqlite } from '../frontierSqlite.js';
import { createFrontier } from '../frontierDb.js';

// ---------------------------------------------------------------------------
// FrontierDbSqlite interface contract tests
//
// These tests verify the public API contract of FrontierDbSqlite, which is
// the sole frontier implementation (JSON fallback removed 2026-03-29).
// ---------------------------------------------------------------------------

function createDb() {
  return new FrontierDbSqlite({ dbPath: ':memory:', config: {} });
}

// =========================================================================
// SECTION 1: recordQuery + getQueryRecord
// =========================================================================

test('query history returns the recorded search attempt for the same product', () => {
  const db = createDb();

  db.recordQuery({
    productId: 'p1',
    query: 'test query',
    provider: 'searxng',
    fields: ['weight'],
    results: [{ url: 'https://example.com' }]
  });

  const record = db.getQueryRecord({ productId: 'p1', query: 'test query' });
  assert.ok(record);
  assert.equal(record.query_text, 'test query');
  assert.equal(record.results.length, 1);
});

test('query history reports no cached search when the product never ran it', () => {
  const db = createDb();

  const record = db.getQueryRecord({ productId: 'p1', query: 'nonexistent' });
  assert.equal(record, null);
});

test('query history reuses the same cache key regardless of search casing', () => {
  const db = createDb();

  db.recordQuery({
    productId: 'p1',
    query: 'Acme Orbit SPECS',
    provider: 'searxng',
    fields: [],
    results: []
  });

  const record = db.getQueryRecord({ productId: 'p1', query: 'acme orbit specs' });
  assert.ok(record, 'case-insensitive lookup should find the record');
  assert.equal(record.query_text, 'acme orbit specs');
});

test('query cache returns the previously captured search results for the same product/query', () => {
  const db = createDb();

  db.recordQuery({
    productId: 'p1',
    query: 'Acme Orbit X1 specs',
    provider: 'google',
    fields: ['weight'],
    results: [
      {
        rank: 1,
        url: 'https://example.com/acme-orbit-x1',
        title: 'Acme Orbit X1',
        host: 'example.com',
        snippet: 'Official product page'
      }
    ]
  });
  const row = db.getQueryRecord({
    productId: 'p1',
    query: 'acme orbit x1 specs'
  });
  assert.equal(Array.isArray(row?.results), true);
  assert.equal(row?.results?.length, 1);
  assert.equal(row?.results?.[0]?.url, 'https://example.com/acme-orbit-x1');
});

// =========================================================================
// SECTION 2: recordFetch + getUrlRow
// =========================================================================

test('fetch history returns the latest status for a crawled URL', () => {
  const db = createDb();

  db.recordFetch({
    productId: 'p1',
    url: 'https://example.com/good-page',
    status: 200,
    fieldsFound: ['weight']
  });

  const row = db.getUrlRow('https://example.com/good-page');
  assert.ok(row);
  assert.equal(row.last_status, 200);
});

test('fetch history retains which product fields a URL contributed', () => {
  const db = createDb();

  db.recordFetch({
    productId: 'p1',
    url: 'https://rtings.com/mouse/viper',
    status: 200,
    fieldsFound: ['weight', 'dpi', 'polling_rate'],
    confidence: 0.92
  });
  const row = db.getUrlRow('https://rtings.com/mouse/viper');
  assert.ok(row);
  assert.ok(Array.isArray(row.fields_found));
  assert.equal(row.fields_found.length >= 3, true);
  assert.ok(row.fields_found.includes('weight'));
  assert.ok(row.fields_found.includes('dpi'));
  assert.ok(row.fields_found.includes('polling_rate'));
});

// =========================================================================
// SECTION 3: buildQueryExecutionHistory
// =========================================================================

test('query execution history is empty for products with no prior search work', () => {
  const db = createDb();

  const history = db.buildQueryExecutionHistory('unknown');
  assert.deepStrictEqual(history, { queries: [] });
});

test('query execution history preserves seed and grouped-search tier metadata', () => {
  const db = createDb();

  db.recordQuery({
    productId: 'p1', query: 'brand model specs', provider: 'google',
    fields: ['weight'], results: [{ url: 'https://a.com', title: '', host: 'a.com', snippet: '' }],
    tier: 'seed', group_key: null, normalized_key: null,
  });
  db.recordQuery({
    productId: 'p1', query: 'brand model sensor dpi', provider: 'google',
    fields: ['sensor', 'dpi'], results: [{ url: 'https://b.com', title: '', host: 'b.com', snippet: '' }],
    tier: 'group_search', group_key: 'sensor_performance', normalized_key: null,
  });

  const history = db.buildQueryExecutionHistory('p1');
  assert.equal(history.queries.length, 2);

  const seed = history.queries.find(q => q.tier === 'seed');
  assert.ok(seed);
  assert.equal(seed.group_key, null);

  const group = history.queries.find(q => q.tier === 'group_search');
  assert.ok(group);
  assert.equal(group.group_key, 'sensor_performance');
});

// =========================================================================
// SECTION 4: aggregateDomainStats
// =========================================================================

test('domain stats summarize recorded fetch activity for each crawled host', () => {
  const db = createDb();

  db.recordFetch({ productId: 'p1', url: 'https://rtings.com/page1', status: 200, fieldsFound: ['weight'] });
  db.recordFetch({ productId: 'p1', url: 'https://rtings.com/page2', status: 200, fieldsFound: ['dpi'] });
  db.recordFetch({ productId: 'p1', url: 'https://rtings.com/page3', status: 404 });

  const stats = db.aggregateDomainStats(['rtings.com']);
  assert.equal(stats.size, 1);
  const rtings = stats.get('rtings.com');
  assert.ok(rtings.fetch_count >= 3);
});

// =========================================================================
// SECTION 5: Factory
// =========================================================================

test('createFrontier returns a FrontierDbSqlite instance', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontier-factory-'));
  fs.mkdirSync(path.join(tmpDir, '_intel', 'frontier'), { recursive: true });
  const origCwd = process.cwd();
  try {
    process.chdir(tmpDir);
    const db = createFrontier({ config: {} });
    assert.ok(db instanceof FrontierDbSqlite);
    db.close();
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// =========================================================================
// SECTION 6: Concurrency safety (daemon with multiple products)
// =========================================================================

test('frontier state keeps concurrent product history isolated by product id', () => {
  const db = createDb();

  db.recordQuery({
    productId: 'p1',
    query: 'product 1 specs',
    provider: 'searxng',
    fields: ['weight'],
    results: [{ url: 'https://a.com/p1' }]
  });
  db.recordQuery({
    productId: 'p2',
    query: 'product 2 specs',
    provider: 'searxng',
    fields: ['dpi'],
    results: [{ url: 'https://b.com/p2' }]
  });
  db.recordFetch({ productId: 'p1', url: 'https://a.com/p1', status: 200, fieldsFound: ['weight'] });
  db.recordFetch({ productId: 'p2', url: 'https://b.com/p2', status: 200, fieldsFound: ['dpi'] });

  const record1 = db.getQueryRecord({ productId: 'p1', query: 'product 1 specs' });
  const record2 = db.getQueryRecord({ productId: 'p2', query: 'product 2 specs' });
  assert.ok(record1);
  assert.ok(record2);
  assert.equal(record1.product_id, 'p1');
  assert.equal(record2.product_id, 'p2');
});

// =========================================================================
// SECTION 7: Edge cases
// =========================================================================

test('frontier recording tolerates orphan queries without crashing the daemon', () => {
  const db = createDb();

  db.recordQuery({
    productId: undefined,
    query: 'orphan query',
    provider: 'test',
    fields: [],
    results: []
  });
  assert.ok(true);
});
