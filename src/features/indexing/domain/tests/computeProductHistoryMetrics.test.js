import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeProductHistoryMetrics } from '../computeProductHistoryMetrics.js';

// ── Factories ────────────────────────────────────────────────────

function makeRun(overrides = {}) {
  return {
    run_id: 'r_001',
    status: 'completed',
    cost_usd: 0.0016,
    started_at: '2026-03-29T12:00:00Z',
    ended_at: '2026-03-29T12:03:00Z',
    counters: { fetched_ok: 21, fetched_error: 4 },
    ...overrides,
  };
}

function makeQuery(overrides = {}) {
  return {
    query: 'razer deathadder v3 pro specs',
    provider: 'google',
    result_count: 8,
    run_id: 'r_001',
    product_id: 'mouse-f74080c4',
    ts: '2026-03-29T12:01:00Z',
    ...overrides,
  };
}

function makeUrl(overrides = {}) {
  return {
    url: 'https://rtings.com/mouse/reviews/razer/deathadder-v3-pro',
    host: 'rtings.com',
    http_status: 200,
    source_tier: 1,
    doc_kind: 'review',
    size_bytes: 81312,
    run_id: 'r_001',
    crawled_at: '2026-03-29T12:02:00Z',
    ...overrides,
  };
}

// ── Test matrix ──────────────────────────────────────────────────

describe('computeProductHistoryMetrics', () => {

  it('computes correct metrics for a typical dataset', () => {
    const runs = [
      makeRun({ run_id: 'r_001', status: 'completed', cost_usd: 0.0016 }),
      makeRun({ run_id: 'r_002', status: 'completed', cost_usd: 0.0024 }),
      makeRun({ run_id: 'r_003', status: 'failed', cost_usd: 0.0004 }),
    ];
    const queries = [
      makeQuery({ run_id: 'r_001', query: 'q1' }),
      makeQuery({ run_id: 'r_001', query: 'q2' }),
      makeQuery({ run_id: 'r_002', query: 'q1' }),
    ];
    const urls = [
      makeUrl({ run_id: 'r_001', host: 'rtings.com', http_status: 200 }),
      makeUrl({ run_id: 'r_001', host: 'razer.com', http_status: 200 }),
      makeUrl({ run_id: 'r_002', host: 'rtings.com', http_status: 403 }),
      makeUrl({ run_id: 'r_003', host: 'amazon.com', http_status: 500 }),
    ];

    const m = computeProductHistoryMetrics({ runs, queries, urls });

    assert.equal(m.total_runs, 3);
    assert.equal(m.completed_runs, 2);
    assert.equal(m.failed_runs, 1);
    assert.equal(m.total_cost_usd, 0.0044);
    assert.equal(m.avg_cost_per_run, 0.0015); // 0.0044/3 rounded
    assert.equal(m.total_queries, 3);
    assert.equal(m.unique_queries, 2);
    assert.equal(m.total_urls, 4);
    assert.equal(m.urls_success, 2); // only the two HTTP 200s
    assert.equal(m.urls_failed, 2); // 403 + 500
    assert.equal(m.unique_hosts, 3);
  });

  it('returns zeros for empty arrays', () => {
    const m = computeProductHistoryMetrics({ runs: [], queries: [], urls: [] });

    assert.equal(m.total_runs, 0);
    assert.equal(m.completed_runs, 0);
    assert.equal(m.failed_runs, 0);
    assert.equal(m.total_cost_usd, 0);
    assert.equal(m.avg_cost_per_run, 0);
    assert.equal(m.total_queries, 0);
    assert.equal(m.unique_queries, 0);
    assert.equal(m.total_urls, 0);
    assert.equal(m.urls_success, 0);
    assert.equal(m.urls_failed, 0);
    assert.equal(m.unique_hosts, 0);
  });

  it('treats null/undefined cost as 0', () => {
    const runs = [
      makeRun({ cost_usd: null }),
      makeRun({ cost_usd: undefined }),
      makeRun({ cost_usd: 0.005 }),
    ];
    const m = computeProductHistoryMetrics({ runs, queries: [], urls: [] });

    assert.equal(m.total_cost_usd, 0.005);
    assert.equal(m.avg_cost_per_run, 0.0017); // 0.005/3 rounded to 4 decimals
  });

  it('counts running status separately from completed/failed', () => {
    const runs = [
      makeRun({ status: 'completed' }),
      makeRun({ status: 'failed' }),
      makeRun({ status: 'running' }),
      makeRun({ status: 'starting' }),
    ];
    const m = computeProductHistoryMetrics({ runs, queries: [], urls: [] });

    assert.equal(m.total_runs, 4);
    assert.equal(m.completed_runs, 1);
    assert.equal(m.failed_runs, 1);
  });

  it('counts unique queries by query text', () => {
    const queries = [
      makeQuery({ query: 'same query', run_id: 'r_001' }),
      makeQuery({ query: 'same query', run_id: 'r_002' }),
      makeQuery({ query: 'different query', run_id: 'r_001' }),
    ];
    const m = computeProductHistoryMetrics({ runs: [], queries, urls: [] });

    assert.equal(m.total_queries, 3);
    assert.equal(m.unique_queries, 2);
  });

  it('classifies HTTP status codes correctly', () => {
    const urls = [
      makeUrl({ http_status: 200 }),  // success
      makeUrl({ http_status: 301 }),  // success (redirect)
      makeUrl({ http_status: 403 }),  // failed
      makeUrl({ http_status: 404 }),  // failed
      makeUrl({ http_status: 500 }),  // failed
      makeUrl({ http_status: 0 }),    // failed (no response)
    ];
    const m = computeProductHistoryMetrics({ runs: [], queries: [], urls });

    assert.equal(m.urls_success, 2);  // 200 + 301
    assert.equal(m.urls_failed, 4);   // 403 + 404 + 500 + 0
  });

  it('handles single run correctly', () => {
    const runs = [makeRun({ cost_usd: 0.0016 })];
    const m = computeProductHistoryMetrics({ runs, queries: [], urls: [] });

    assert.equal(m.total_runs, 1);
    assert.equal(m.avg_cost_per_run, 0.0016);
  });
});
