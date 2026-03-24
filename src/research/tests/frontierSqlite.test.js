import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { FrontierDbSqlite } from '../frontierSqlite.js';

// ---------------------------------------------------------------------------
// Gap #2 — SQLite Frontier Backend Tests
// ---------------------------------------------------------------------------

function tmpDbPath() {
  return path.join(os.tmpdir(), `frontier-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function cleanup(dbPath) {
  try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
}

test('sqlite frontier: creates database and tables', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    assert.ok(fs.existsSync(dbPath));
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: recordQuery stores and retrieves query', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    const result = frontier.recordQuery({
      productId: 'mouse-001',
      query: 'Acme Orbit X1 specs',
      provider: 'google',
      fields: ['weight', 'sensor'],
      results: [{ rank: 1, url: 'https://example.com/orbit-x1', title: 'Orbit X1 Specs', host: 'example.com', snippet: 'The Orbit X1 overview...' }]
    });
    assert.ok(result);
    assert.ok(result.query_hash);
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: getQueryRecord returns cached query results', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    frontier.recordQuery({
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
    const row = frontier.getQueryRecord({
      productId: 'p1',
      query: 'acme orbit x1 specs'
    });
    assert.equal(Array.isArray(row?.results), true);
    assert.equal(row?.results?.length, 1);
    assert.equal(row?.results?.[0]?.url, 'https://example.com/acme-orbit-x1');
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: recordFetch stores URL data', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    const result = frontier.recordFetch({
      productId: 'p1',
      url: 'https://example.com/mouse',
      status: 200,
      contentType: 'text/html',
      bytes: 5000,
      elapsedMs: 300
    });
    assert.ok(result);
    assert.equal(result.last_status, 200);
    assert.equal(result.fetch_count, 1);
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: recordFetch increments fetch count', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    frontier.recordFetch({ productId: 'p1', url: 'https://example.com', status: 200 });
    const result = frontier.recordFetch({ productId: 'p1', url: 'https://example.com', status: 200 });
    assert.equal(result.fetch_count, 2);
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: getUrlRow returns stored data', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    frontier.recordFetch({ productId: 'p1', url: 'https://example.com', status: 200, bytes: 1234 });
    const row = frontier.getUrlRow('https://example.com');
    assert.ok(row);
    assert.equal(row.last_status, 200);
    assert.equal(row.bytes, 1234);
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: getUrlRow returns null for unknown URL', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    assert.equal(frontier.getUrlRow('https://unknown.com'), null);
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

// ---------------------------------------------------------------------------
// Tier metadata support (parity with JSON FrontierDb)
// ---------------------------------------------------------------------------

test('sqlite frontier: recordQuery persists tier metadata when provided', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    frontier.recordQuery({
      productId: 'p1',
      query: 'razer viper v3 specs',
      provider: 'google',
      fields: ['weight'],
      results: [{ url: 'https://example.com' }],
      tier: 'seed',
      group_key: null,
      normalized_key: null,
      hint_source: 'tier1_seed',
    });
    const record = frontier.getQueryRecord({ productId: 'p1', query: 'razer viper v3 specs' });
    assert.equal(record.tier, 'seed');
    assert.equal(record.group_key, null);
    assert.equal(record.normalized_key, null);
    assert.equal(record.hint_source, 'tier1_seed');
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: recordQuery defaults tier fields to null when not provided', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    frontier.recordQuery({
      productId: 'p1',
      query: 'razer viper v3 specs',
      provider: 'google',
    });
    const record = frontier.getQueryRecord({ productId: 'p1', query: 'razer viper v3 specs' });
    assert.equal(record.tier, null);
    assert.equal(record.group_key, null);
    assert.equal(record.normalized_key, null);
    assert.equal(record.hint_source, null);
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: recordQuery preserves tier on re-record (update path)', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    frontier.recordQuery({
      productId: 'p1', query: 'test query', provider: 'google',
      tier: 'seed', hint_source: 'tier1_seed',
    });
    // Re-record same query without tier — should preserve original
    frontier.recordQuery({
      productId: 'p1', query: 'test query', provider: 'bing',
    });
    const record = frontier.getQueryRecord({ productId: 'p1', query: 'test query' });
    assert.equal(record.tier, 'seed', 'tier should be preserved on update');
    assert.equal(record.hint_source, 'tier1_seed', 'hint_source should be preserved on update');
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: buildQueryExecutionHistory returns empty for unknown product', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    const history = frontier.buildQueryExecutionHistory('unknown');
    assert.deepEqual(history, { queries: [] });
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: buildQueryExecutionHistory maps tier metadata from recorded queries', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    frontier.recordQuery({
      productId: 'p1', query: 'razer viper v3 specs', provider: 'google',
      results: [{ url: 'https://example.com' }],
      tier: 'seed', group_key: null, normalized_key: null, hint_source: 'tier1_seed',
    });
    frontier.recordQuery({
      productId: 'p1', query: 'razer viper v3 sensor performance', provider: 'google',
      results: [{ url: 'https://example.com/sensor' }],
      tier: 'group_search', group_key: 'sensor_performance', normalized_key: null, hint_source: 'tier2_group',
    });
    frontier.recordQuery({
      productId: 'p1', query: 'razer viper v3 battery hours', provider: 'google',
      results: [],
      tier: 'key_search', group_key: 'connectivity', normalized_key: 'battery hours', hint_source: 'tier3_key',
    });
    const history = frontier.buildQueryExecutionHistory('p1');
    assert.equal(history.queries.length, 3);

    const seed = history.queries.find(q => q.tier === 'seed');
    assert.ok(seed);
    assert.equal(seed.status, 'scrape_complete');

    const group = history.queries.find(q => q.tier === 'group_search');
    assert.ok(group);
    assert.equal(group.group_key, 'sensor_performance');

    const key = history.queries.find(q => q.tier === 'key_search');
    assert.ok(key);
    assert.equal(key.normalized_key, 'battery hours');
    assert.equal(key.status, 'pending');
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: buildQueryExecutionHistory handles legacy queries without tier', () => {
  const dbPath = tmpDbPath();
  try {
    const frontier = new FrontierDbSqlite({ dbPath });
    frontier.recordQuery({
      productId: 'p1', query: 'old legacy query', provider: 'google',
      results: [{ url: 'https://example.com' }],
    });
    const history = frontier.buildQueryExecutionHistory('p1');
    assert.equal(history.queries.length, 1);
    assert.equal(history.queries[0].tier, null);
    assert.equal(history.queries[0].group_key, null);
    assert.equal(history.queries[0].normalized_key, null);
    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});

test('sqlite frontier: schema migration adds tier columns to existing database', () => {
  const dbPath = tmpDbPath();
  try {
    // Create a DB with the old schema (no tier columns)
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS queries (
        query_hash TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        query_text TEXT NOT NULL,
        provider TEXT DEFAULT '',
        fields TEXT DEFAULT '[]',
        attempts INTEGER DEFAULT 1,
        first_ts TEXT NOT NULL,
        last_ts TEXT NOT NULL,
        results TEXT DEFAULT '[]'
      );
    `);
    db.prepare(
      'INSERT INTO queries (query_hash, product_id, query_text, provider, first_ts, last_ts) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('legacy_hash', 'p1', 'old query', 'google', '2026-01-01', '2026-01-01');
    db.close();

    // Now open with FrontierDbSqlite — migration should add tier columns
    const frontier = new FrontierDbSqlite({ dbPath });

    // Verify new tier-aware recording works on migrated DB
    frontier.recordQuery({
      productId: 'p1', query: 'new query', provider: 'bing',
      tier: 'seed', hint_source: 'tier1_seed',
    });
    const record = frontier.getQueryRecord({ productId: 'p1', query: 'new query' });
    assert.ok(record, 'new record on migrated DB should work');
    assert.equal(record.tier, 'seed', 'tier should persist on migrated DB');
    assert.equal(record.hint_source, 'tier1_seed', 'hint_source should persist on migrated DB');

    // Verify old row has null tier via buildQueryExecutionHistory
    const history = frontier.buildQueryExecutionHistory('p1');
    const legacyQuery = history.queries.find(q => q.query_text === 'old query');
    assert.ok(legacyQuery, 'legacy query should appear in history');
    assert.equal(legacyQuery.tier, null, 'legacy row should have null tier');

    frontier.close();
  } finally {
    cleanup(dbPath);
  }
});
