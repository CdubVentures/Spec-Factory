// WHY: Contract test — SQL insert → read → pure aggregation produces correct summary shapes.
// Verifies that computeQueryIndexSummary and computeUrlIndexSummary work with SQL rows.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { SpecDb } from '../../../../../db/specDb.js';
import { computeQueryIndexSummary, computeUrlIndexSummary } from '../createQueryIndex.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

describe('queryIndex SQL → computeQueryIndexSummary', () => {
  it('empty table returns zeroed summary', () => {
    const specDb = createHarness();
    const rows = specDb.getQueryIndexByCategory('mouse');
    const summary = computeQueryIndexSummary(rows);
    strictEqual(summary.total, 0);
    strictEqual(summary.dead_count, 0);
    deepStrictEqual(summary.top_yield, []);
    deepStrictEqual(summary.provider_breakdown, {});
  });

  it('single row produces correct summary', () => {
    const specDb = createHarness();
    specDb.insertQueryIndexEntry({
      category: 'mouse', run_id: 'r1', product_id: 'p1',
      query: 'razer viper weight', provider: 'searxng',
      result_count: 5, field_yield: ['weight'], ts: '2026-01-01T00:00:00Z',
    });
    const rows = specDb.getQueryIndexByCategory('mouse');
    const summary = computeQueryIndexSummary(rows);
    strictEqual(summary.total, 1);
    strictEqual(summary.dead_count, 0);
    ok(summary.top_yield.length > 0);
    ok(summary.provider_breakdown.searxng);
    strictEqual(summary.provider_breakdown.searxng.query_count, 1);
  });

  it('3+ zero-yield queries flagged as dead', () => {
    const specDb = createHarness();
    for (let i = 0; i < 3; i++) {
      specDb.insertQueryIndexEntry({
        category: 'mouse', run_id: `r${i}`, product_id: 'p1',
        query: 'dead query', provider: 'searxng',
        result_count: 0, field_yield: null, ts: `2026-01-0${i + 1}T00:00:00Z`,
      });
    }
    const rows = specDb.getQueryIndexByCategory('mouse');
    const summary = computeQueryIndexSummary(rows);
    strictEqual(summary.total, 3);
    strictEqual(summary.dead_count, 1);
  });

  it('provider breakdown aggregates across queries', () => {
    const specDb = createHarness();
    specDb.insertQueryIndexEntry({ category: 'mouse', run_id: 'r1', product_id: 'p1', query: 'q1', provider: 'bing', result_count: 10, field_yield: ['weight'], ts: '2026-01-01T00:00:00Z' });
    specDb.insertQueryIndexEntry({ category: 'mouse', run_id: 'r1', product_id: 'p1', query: 'q2', provider: 'bing', result_count: 5, field_yield: null, ts: '2026-01-01T00:01:00Z' });
    specDb.insertQueryIndexEntry({ category: 'mouse', run_id: 'r1', product_id: 'p1', query: 'q3', provider: 'google', result_count: 8, field_yield: ['dpi', 'weight'], ts: '2026-01-01T00:02:00Z' });

    const rows = specDb.getQueryIndexByCategory('mouse');
    const summary = computeQueryIndexSummary(rows);
    strictEqual(summary.total, 3);
    strictEqual(summary.provider_breakdown.bing.query_count, 2);
    strictEqual(summary.provider_breakdown.google.query_count, 1);
  });
});

describe('urlIndex SQL → computeUrlIndexSummary', () => {
  it('empty table returns zeroed summary', () => {
    const specDb = createHarness();
    const rows = specDb.getUrlIndexByCategory('mouse');
    const summary = computeUrlIndexSummary(rows);
    strictEqual(summary.total, 0);
    deepStrictEqual(summary.reuse_distribution, {});
    deepStrictEqual(summary.high_yield, []);
    deepStrictEqual(summary.tier_breakdown, {});
  });

  it('single row produces correct summary', () => {
    const specDb = createHarness();
    specDb.insertUrlIndexEntry({
      category: 'mouse', run_id: 'r1', url: 'https://example.com/spec',
      host: 'example.com', tier: 't1', doc_kind: 'spec',
      fields_filled: ['weight', 'dpi'], fetch_success: true, ts: '2026-01-01T00:00:00Z',
    });
    const rows = specDb.getUrlIndexByCategory('mouse');
    const summary = computeUrlIndexSummary(rows);
    strictEqual(summary.total, 1);
    ok(summary.tier_breakdown.t1);
    strictEqual(summary.tier_breakdown.t1.url_count, 1);
  });

  it('deduplicates same url+run_id', () => {
    const specDb = createHarness();
    // Same url, same run — should dedupe
    specDb.insertUrlIndexEntry({ category: 'mouse', run_id: 'r1', url: 'https://a.com', host: 'a.com', tier: 't1', doc_kind: 'spec', fields_filled: ['weight'], fetch_success: true, ts: '2026-01-01T00:00:00Z' });
    specDb.insertUrlIndexEntry({ category: 'mouse', run_id: 'r1', url: 'https://a.com', host: 'a.com', tier: 't1', doc_kind: 'spec', fields_filled: ['dpi'], fetch_success: true, ts: '2026-01-01T00:01:00Z' });
    // Same url, different run — should NOT dedupe
    specDb.insertUrlIndexEntry({ category: 'mouse', run_id: 'r2', url: 'https://a.com', host: 'a.com', tier: 't1', doc_kind: 'spec', fields_filled: ['weight'], fetch_success: true, ts: '2026-01-02T00:00:00Z' });

    const rows = specDb.getUrlIndexByCategory('mouse');
    const summary = computeUrlIndexSummary(rows);
    // 3 raw rows but dedupe means 2 unique url+run combos
    strictEqual(summary.reuse_distribution['2'], 1); // url 'a.com' visited in 2 runs
  });

  it('high_yield requires 3+ visits and 5+ fields', () => {
    const specDb = createHarness();
    const fields = ['weight', 'dpi', 'sensor', 'cable', 'shape'];
    for (let i = 0; i < 3; i++) {
      specDb.insertUrlIndexEntry({ category: 'mouse', run_id: `r${i}`, url: 'https://high.com', host: 'high.com', tier: 't1', doc_kind: 'spec', fields_filled: fields, fetch_success: true, ts: `2026-01-0${i + 1}T00:00:00Z` });
    }
    const rows = specDb.getUrlIndexByCategory('mouse');
    const summary = computeUrlIndexSummary(rows);
    strictEqual(summary.high_yield.length, 1);
    strictEqual(summary.high_yield[0].url, 'https://high.com');
  });
});
