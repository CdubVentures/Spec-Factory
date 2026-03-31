// WHY: Contract tests for url_crawl_ledger + query_cooldowns tables.
// Verifies upsert accumulation, cooldown expiry, domain aggregation, and rebuild seeding.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { SpecDb } from '../../specDb.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

// ---------------------------------------------------------------------------
// url_crawl_ledger
// ---------------------------------------------------------------------------

describe('crawlLedgerStore — upsertUrlCrawlEntry', () => {
  it('inserts a new URL crawl entry', () => {
    const db = createHarness();
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://example.com/page',
      product_id: 'prod-1',
      category: 'mouse',
      original_url: 'https://example.com/page?ref=1',
      domain: 'example.com',
      path_sig: '/page',
      final_url: 'https://example.com/page',
      content_hash: 'abc123',
      http_status: 200,
      bytes: 5000,
      elapsed_ms: 150,
      fetch_count: 1,
      ok_count: 1,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-1',
      last_seen_run_id: 'run-1',
    });

    const row = db.getUrlCrawlEntry('https://example.com/page', 'prod-1');
    strictEqual(row.canonical_url, 'https://example.com/page');
    strictEqual(row.product_id, 'prod-1');
    strictEqual(row.domain, 'example.com');
    strictEqual(row.http_status, 200);
    strictEqual(row.fetch_count, 1);
    strictEqual(row.ok_count, 1);
    strictEqual(row.content_hash, 'abc123');
  });

  it('accumulates counters on upsert for same canonical_url + product_id', () => {
    const db = createHarness();
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://example.com/page',
      product_id: 'prod-1',
      category: 'mouse',
      domain: 'example.com',
      http_status: 200,
      fetch_count: 1,
      ok_count: 1,
      elapsed_ms: 100,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-1',
      last_seen_run_id: 'run-1',
    });
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://example.com/page',
      product_id: 'prod-1',
      category: 'mouse',
      domain: 'example.com',
      http_status: 403,
      fetch_count: 1,
      blocked_count: 1,
      elapsed_ms: 200,
      last_seen_ts: '2026-03-29T00:00:00Z',
      last_seen_run_id: 'run-2',
    });

    const row = db.getUrlCrawlEntry('https://example.com/page', 'prod-1');
    strictEqual(row.fetch_count, 2, 'fetch_count should accumulate');
    strictEqual(row.ok_count, 1, 'ok_count from first insert preserved');
    strictEqual(row.blocked_count, 1, 'blocked_count from second insert');
    strictEqual(row.http_status, 403, 'http_status should be latest');
    strictEqual(row.elapsed_ms, 200, 'elapsed_ms should be latest');
    strictEqual(row.last_seen_run_id, 'run-2', 'last_seen_run_id should update');
    strictEqual(row.first_seen_run_id, 'run-1', 'first_seen_run_id should NOT change');
  });

  it('isolates entries by product_id', () => {
    const db = createHarness();
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://example.com/shared',
      product_id: 'prod-1',
      category: 'mouse',
      domain: 'example.com',
      http_status: 200,
      fetch_count: 1,
      ok_count: 1,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-1',
      last_seen_run_id: 'run-1',
    });
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://example.com/shared',
      product_id: 'prod-2',
      category: 'mouse',
      domain: 'example.com',
      http_status: 200,
      fetch_count: 1,
      ok_count: 1,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-2',
      last_seen_run_id: 'run-2',
    });

    const row1 = db.getUrlCrawlEntry('https://example.com/shared', 'prod-1');
    const row2 = db.getUrlCrawlEntry('https://example.com/shared', 'prod-2');
    strictEqual(row1.first_seen_run_id, 'run-1');
    strictEqual(row2.first_seen_run_id, 'run-2');
  });

  it('returns null for non-existent entry', () => {
    const db = createHarness();
    const row = db.getUrlCrawlEntry('https://missing.com', 'prod-1');
    strictEqual(row, null);
  });
});

describe('crawlLedgerStore — getUrlCrawlEntriesByProduct', () => {
  it('returns all entries for a product', () => {
    const db = createHarness();
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://a.com',
      product_id: 'prod-1',
      category: 'mouse',
      domain: 'a.com',
      http_status: 200,
      fetch_count: 1,
      ok_count: 1,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-1',
      last_seen_run_id: 'run-1',
    });
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://b.com',
      product_id: 'prod-1',
      category: 'mouse',
      domain: 'b.com',
      http_status: 200,
      fetch_count: 1,
      ok_count: 1,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-1',
      last_seen_run_id: 'run-1',
    });
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://c.com',
      product_id: 'prod-2',
      category: 'mouse',
      domain: 'c.com',
      http_status: 200,
      fetch_count: 1,
      ok_count: 1,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-1',
      last_seen_run_id: 'run-1',
    });

    const rows = db.getUrlCrawlEntriesByProduct('prod-1');
    strictEqual(rows.length, 2);
  });

  it('returns empty array for unknown product', () => {
    const db = createHarness();
    const rows = db.getUrlCrawlEntriesByProduct('missing');
    deepStrictEqual(rows, []);
  });
});

describe('crawlLedgerStore — aggregateDomainStats', () => {
  it('returns per-domain stats scoped to product', () => {
    const db = createHarness();
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://example.com/a',
      product_id: 'prod-1',
      category: 'mouse',
      domain: 'example.com',
      http_status: 200,
      fetch_count: 1,
      ok_count: 1,
      elapsed_ms: 100,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-1',
      last_seen_run_id: 'run-1',
    });
    db.upsertUrlCrawlEntry({
      canonical_url: 'https://example.com/b',
      product_id: 'prod-1',
      category: 'mouse',
      domain: 'example.com',
      http_status: 403,
      fetch_count: 1,
      blocked_count: 1,
      elapsed_ms: 50,
      first_seen_ts: '2026-03-28T00:00:00Z',
      last_seen_ts: '2026-03-28T00:00:00Z',
      first_seen_run_id: 'run-1',
      last_seen_run_id: 'run-1',
    });

    const stats = db.aggregateDomainStats(['example.com'], 'prod-1');
    ok(stats instanceof Map);
    const s = stats.get('example.com');
    ok(s, 'should have stats for example.com');
    strictEqual(s.fetch_count, 2);
    strictEqual(s.ok_count, 1);
    strictEqual(s.blocked_count, 1);
    strictEqual(s.success_rate, 0.5);
  });

  it('returns empty map for unknown domains', () => {
    const db = createHarness();
    const stats = db.aggregateDomainStats(['missing.com'], 'prod-1');
    strictEqual(stats.size, 0);
  });
});

// ---------------------------------------------------------------------------
// query_cooldowns
// ---------------------------------------------------------------------------

describe('crawlLedgerStore — upsertQueryCooldown', () => {
  it('inserts a new query cooldown entry', () => {
    const db = createHarness();
    db.upsertQueryCooldown({
      query_hash: 'hash-1',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'razer viper specifications',
      provider: 'google',
      tier: 'seed',
      group_key: null,
      normalized_key: null,
      hint_source: 'tier1_seed',
      attempt_count: 1,
      result_count: 10,
      last_executed_at: '2026-03-28T00:00:00Z',
      cooldown_until: '2026-04-27T00:00:00Z',
    });

    const row = db.getQueryCooldown('hash-1', 'prod-1');
    ok(row, 'should return the row when in cooldown');
    strictEqual(row.query_text, 'razer viper specifications');
    strictEqual(row.tier, 'seed');
    strictEqual(row.attempt_count, 1);
    strictEqual(row.cooldown_until, '2026-04-27T00:00:00Z');
  });

  it('increments attempt_count on upsert', () => {
    const db = createHarness();
    db.upsertQueryCooldown({
      query_hash: 'hash-1',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'razer viper specifications',
      provider: 'google',
      tier: 'seed',
      attempt_count: 1,
      result_count: 10,
      last_executed_at: '2026-03-28T00:00:00Z',
      cooldown_until: '2026-04-27T00:00:00Z',
    });
    db.upsertQueryCooldown({
      query_hash: 'hash-1',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'razer viper specifications',
      provider: 'bing',
      tier: 'seed',
      attempt_count: 1,
      result_count: 5,
      last_executed_at: '2026-03-29T00:00:00Z',
      cooldown_until: '2026-04-28T00:00:00Z',
    });

    const row = db.getQueryCooldown('hash-1', 'prod-1');
    strictEqual(row.attempt_count, 2, 'attempt_count should accumulate');
    strictEqual(row.provider, 'bing', 'provider should be latest');
    strictEqual(row.cooldown_until, '2026-04-28T00:00:00Z', 'cooldown_until should update');
  });
});

describe('crawlLedgerStore — getQueryCooldown expiry', () => {
  it('returns null when cooldown has expired', () => {
    const db = createHarness();
    db.upsertQueryCooldown({
      query_hash: 'hash-expired',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'old query',
      provider: 'google',
      attempt_count: 1,
      result_count: 5,
      last_executed_at: '2020-01-01T00:00:00Z',
      cooldown_until: '2020-02-01T00:00:00Z',
    });

    const row = db.getQueryCooldown('hash-expired', 'prod-1');
    strictEqual(row, null, 'expired cooldown should return null');
  });

  it('returns row when cooldown is still active', () => {
    const db = createHarness();
    const future = new Date(Date.now() + 86400000 * 30).toISOString();
    db.upsertQueryCooldown({
      query_hash: 'hash-active',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'fresh query',
      provider: 'google',
      attempt_count: 1,
      result_count: 5,
      last_executed_at: new Date().toISOString(),
      cooldown_until: future,
    });

    const row = db.getQueryCooldown('hash-active', 'prod-1');
    ok(row, 'active cooldown should return row');
    strictEqual(row.query_text, 'fresh query');
  });

  it('returns null for non-existent query', () => {
    const db = createHarness();
    const row = db.getQueryCooldown('missing', 'prod-1');
    strictEqual(row, null);
  });
});

describe('crawlLedgerStore — buildQueryExecutionHistory', () => {
  it('returns all queries for a product regardless of cooldown state', () => {
    const db = createHarness();
    db.upsertQueryCooldown({
      query_hash: 'h1',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'query one',
      provider: 'google',
      tier: 'seed',
      attempt_count: 1,
      result_count: 10,
      last_executed_at: '2026-03-28T00:00:00Z',
      cooldown_until: '2026-04-27T00:00:00Z',
    });
    db.upsertQueryCooldown({
      query_hash: 'h2',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'query two',
      provider: 'bing',
      tier: 'group_search',
      group_key: 'connectivity',
      attempt_count: 2,
      result_count: 5,
      last_executed_at: '2020-01-01T00:00:00Z',
      cooldown_until: '2020-02-01T00:00:00Z',
    });
    db.upsertQueryCooldown({
      query_hash: 'h3',
      product_id: 'prod-2',
      category: 'mouse',
      query_text: 'other product',
      provider: 'google',
      tier: 'seed',
      attempt_count: 1,
      result_count: 3,
      last_executed_at: '2026-03-28T00:00:00Z',
      cooldown_until: '2026-04-27T00:00:00Z',
    });

    const history = db.buildQueryExecutionHistory('prod-1');
    ok(history.queries, 'should have queries array');
    strictEqual(history.queries.length, 2, 'should only include prod-1 queries');
    const q1 = history.queries.find((q) => q.query_text === 'query one');
    ok(q1, 'should find query one');
    strictEqual(q1.tier, 'seed');
    strictEqual(q1.completed_at_ms > 0, true, 'should have completed_at_ms');
    ok(q1.cooldown_until, 'should include cooldown_until');
  });

  it('returns empty queries array for unknown product', () => {
    const db = createHarness();
    const history = db.buildQueryExecutionHistory('missing');
    deepStrictEqual(history, { queries: [] });
  });
});

describe('crawlLedgerStore — purgeExpiredCooldowns', () => {
  it('deletes expired cooldowns, keeps active ones', () => {
    const db = createHarness();
    const future = new Date(Date.now() + 86400000 * 30).toISOString();
    db.upsertQueryCooldown({
      query_hash: 'expired',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'old',
      provider: 'google',
      attempt_count: 1,
      result_count: 5,
      last_executed_at: '2020-01-01T00:00:00Z',
      cooldown_until: '2020-02-01T00:00:00Z',
    });
    db.upsertQueryCooldown({
      query_hash: 'active',
      product_id: 'prod-1',
      category: 'mouse',
      query_text: 'fresh',
      provider: 'google',
      attempt_count: 1,
      result_count: 5,
      last_executed_at: new Date().toISOString(),
      cooldown_until: future,
    });

    const purged = db.purgeExpiredCooldowns();
    strictEqual(purged, 1, 'should purge 1 expired row');

    const history = db.buildQueryExecutionHistory('prod-1');
    strictEqual(history.queries.length, 1, 'only active query should remain');
    strictEqual(history.queries[0].query_text, 'fresh');
  });
});
