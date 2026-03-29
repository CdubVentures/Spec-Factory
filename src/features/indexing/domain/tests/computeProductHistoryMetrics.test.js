import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeProductHistoryMetrics } from '../computeProductHistoryMetrics.js';

// ── Factories ────────────────────────────────────────────────────

function makeRun(overrides = {}) {
  return {
    run_id: 'r_001',
    status: 'completed',
    cost_usd_run: 0.30,
    sources_attempted: 10,
    run_at: '2026-03-29T12:00:00Z',
    ...overrides,
  };
}

function makeQuery(overrides = {}) {
  return {
    query: 'razer deathadder v3 pro specs',
    provider: 'google',
    result_count: 8,
    run_id: 'r_001',
    product_id: 'razer-deathadder-v3-pro',
    ts: '2026-03-29T12:01:00Z',
    ...overrides,
  };
}

function makeUrl(overrides = {}) {
  return {
    url: 'https://rtings.com/mouse/reviews/razer/deathadder-v3-pro',
    host: 'rtings.com',
    tier: 'T1',
    doc_kind: 'review',
    fetch_success: true,
    run_id: 'r_001',
    ts: '2026-03-29T12:02:00Z',
    ...overrides,
  };
}

// ── Test matrix ──────────────────────────────────────────────────

describe('computeProductHistoryMetrics', () => {

  // ── Happy path ─────────────────────────────────────────────────

  it('computes correct metrics for a typical dataset', () => {
    const runs = [
      makeRun({ run_id: 'r_001', status: 'completed', cost_usd_run: 0.34 }),
      makeRun({ run_id: 'r_002', status: 'completed', cost_usd_run: 0.41 }),
      makeRun({ run_id: 'r_003', status: 'failed', cost_usd_run: 0.08 }),
    ];
    const queries = [
      makeQuery({ run_id: 'r_001', query: 'q1' }),
      makeQuery({ run_id: 'r_001', query: 'q2' }),
      makeQuery({ run_id: 'r_002', query: 'q1' }),
    ];
    const urls = [
      makeUrl({ run_id: 'r_001', host: 'rtings.com', fetch_success: true }),
      makeUrl({ run_id: 'r_001', host: 'razer.com', fetch_success: true }),
      makeUrl({ run_id: 'r_002', host: 'rtings.com', fetch_success: false }),
      makeUrl({ run_id: 'r_003', host: 'amazon.com', fetch_success: false }),
    ];

    const m = computeProductHistoryMetrics({ runs, queries, urls });

    assert.equal(m.total_runs, 3);
    assert.equal(m.completed_runs, 2);
    assert.equal(m.failed_runs, 1);
    assert.equal(m.total_cost_usd, 0.83);
    assert.equal(m.avg_cost_per_run, 0.28); // 0.83/3 rounded to 2 decimals
    assert.equal(m.total_queries, 3);
    assert.equal(m.unique_queries, 2); // 'q1' and 'q2'
    assert.equal(m.total_urls, 4);
    assert.equal(m.urls_success, 2);
    assert.equal(m.urls_failed, 2);
    assert.equal(m.unique_hosts, 3); // rtings.com, razer.com, amazon.com
  });

  // ── Empty inputs ───────────────────────────────────────────────

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

  // ── Null/undefined cost handling ───────────────────────────────

  it('treats null/undefined cost as 0', () => {
    const runs = [
      makeRun({ cost_usd_run: null }),
      makeRun({ cost_usd_run: undefined }),
      makeRun({ cost_usd_run: 0.50 }),
    ];
    const m = computeProductHistoryMetrics({ runs, queries: [], urls: [] });

    assert.equal(m.total_cost_usd, 0.50);
    assert.equal(m.avg_cost_per_run, 0.17); // 0.50/3
  });

  // ── Status counting (only completed and failed) ────────────────

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

  // ── Duplicate query deduplication ──────────────────────────────

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

  // ── URL success boolean coercion ───────────────────────────────

  it('handles fetch_success as boolean or truthy/falsy', () => {
    const urls = [
      makeUrl({ fetch_success: true }),
      makeUrl({ fetch_success: false }),
      makeUrl({ fetch_success: 1 }),
      makeUrl({ fetch_success: 0 }),
    ];
    const m = computeProductHistoryMetrics({ runs: [], queries: [], urls });

    assert.equal(m.urls_success, 2);
    assert.equal(m.urls_failed, 2);
  });

  // ── Single run edge case ───────────────────────────────────────

  it('handles single run correctly', () => {
    const runs = [makeRun({ cost_usd_run: 0.25 })];
    const m = computeProductHistoryMetrics({ runs, queries: [], urls: [] });

    assert.equal(m.total_runs, 1);
    assert.equal(m.avg_cost_per_run, 0.25);
  });
});
