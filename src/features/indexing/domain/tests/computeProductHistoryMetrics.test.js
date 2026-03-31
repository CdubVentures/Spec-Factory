import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeProductHistoryMetrics } from '../computeProductHistoryMetrics.js';

function makeRun(overrides = {}) {
  return {
    run_id: 'r_001', status: 'completed', cost_usd: 0.0016,
    started_at: '2026-03-31T05:37:00Z', ended_at: '2026-03-31T05:39:31Z',
    funnel: { queries_executed: 10, results_found: 100, urls_selected: 25, urls_ok: 21 },
    ...overrides,
  };
}

function makeUrl(overrides = {}) {
  return { url: 'https://example.com', host: 'example.com', http_status: 200, size_bytes: 1000, ...overrides };
}

describe('computeProductHistoryMetrics', () => {

  it('computes aggregate from multiple runs', () => {
    const runs = [
      makeRun({ run_id: 'r1', cost_usd: 0.0016, funnel: { queries_executed: 10 } }),
      makeRun({ run_id: 'r2', cost_usd: 0.0024, status: 'failed', funnel: { queries_executed: 8 } }),
    ];
    const urls = [
      makeUrl({ http_status: 200, host: 'a.com' }),
      makeUrl({ http_status: 403, host: 'b.com' }),
    ];
    const m = computeProductHistoryMetrics({ runs, urls });

    assert.equal(m.total_runs, 2);
    assert.equal(m.completed_runs, 1);
    assert.equal(m.failed_runs, 1);
    assert.equal(m.total_cost_usd, 0.004);
    assert.equal(m.total_queries, 18);
    assert.equal(m.total_urls, 2);
    assert.equal(m.urls_success, 1);
    assert.equal(m.urls_failed, 1);
    assert.equal(m.unique_hosts, 2);
  });

  it('returns zeros for empty', () => {
    const m = computeProductHistoryMetrics({ runs: [], urls: [] });
    assert.equal(m.total_runs, 0);
    assert.equal(m.total_cost_usd, 0);
    assert.equal(m.avg_duration_ms, 0);
    assert.equal(m.total_queries, 0);
  });

  it('computes avg duration', () => {
    const runs = [
      makeRun({ started_at: '2026-03-31T05:00:00Z', ended_at: '2026-03-31T05:02:00Z' }),
      makeRun({ started_at: '2026-03-31T06:00:00Z', ended_at: '2026-03-31T06:04:00Z' }),
    ];
    const m = computeProductHistoryMetrics({ runs, urls: [] });
    assert.equal(m.avg_duration_ms, 180000); // (120s + 240s) / 2 = 180s
  });

  it('handles HTTP status classification', () => {
    const urls = [
      makeUrl({ http_status: 200 }), makeUrl({ http_status: 301 }),
      makeUrl({ http_status: 403 }), makeUrl({ http_status: 500 }), makeUrl({ http_status: 0 }),
    ];
    const m = computeProductHistoryMetrics({ runs: [], urls });
    assert.equal(m.urls_success, 2);
    assert.equal(m.urls_failed, 3);
  });
});
