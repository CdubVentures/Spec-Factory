import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateCrossRunMetrics } from '../crossRunMetrics.js';

// ── helpers ─────────────────────────────────────────────────
function makeRun(id, counters = {}, startedAt = '') {
  return {
    run_id: id,
    category: 'mouse',
    started_at: startedAt,
    counters: {
      fields_filled: counters.fields_filled ?? 0,
      fields_total: counters.fields_total ?? 0,
      fetched_ok: counters.fetched_ok ?? 0,
      fetched_blocked: counters.fetched_blocked ?? 0,
      fetched_error: counters.fetched_error ?? 0,
      pages_checked: counters.pages_checked ?? 0,
      ...counters,
    },
  };
}

// ── tests ───────────────────────────────────────────────────
test('crossRunMetrics — 0 runs → all sparklines empty', () => {
  const result = aggregateCrossRunMetrics({ category: 'mouse', runSummaries: [] });
  assert.equal(result.category, 'mouse');
  assert.equal(result.run_count, 0);
  assert.equal(result.field_fill_rate, 0);
  assert.equal(result.searches_per_product, 0);
  assert.deepEqual(result.sparkline_data.fill_rate, []);
  assert.deepEqual(result.sparkline_data.searches, []);
  assert.deepEqual(result.sparkline_data.block_rate, []);
});

test('crossRunMetrics — 1 run → sparkline length 1', () => {
  const result = aggregateCrossRunMetrics({
    category: 'mouse',
    runSummaries: [makeRun('r1', { fields_filled: 10, fields_total: 20, pages_checked: 5 })],
  });
  assert.equal(result.run_count, 1);
  assert.equal(result.sparkline_data.fill_rate.length, 1);
  assert.equal(result.sparkline_data.searches.length, 1);
  assert.equal(result.sparkline_data.block_rate.length, 1);
});

test('crossRunMetrics — 3 runs → sparklines length 3', () => {
  const runs = [
    makeRun('r1', { fields_filled: 5, fields_total: 20, pages_checked: 2 }, '2026-01-01'),
    makeRun('r2', { fields_filled: 10, fields_total: 20, pages_checked: 3 }, '2026-01-02'),
    makeRun('r3', { fields_filled: 15, fields_total: 20, pages_checked: 4 }, '2026-01-03'),
  ];
  const result = aggregateCrossRunMetrics({ category: 'mouse', runSummaries: runs });
  assert.equal(result.run_count, 3);
  assert.equal(result.sparkline_data.fill_rate.length, 3);
  assert.equal(result.sparkline_data.searches.length, 3);
  assert.equal(result.sparkline_data.block_rate.length, 3);
});

test('crossRunMetrics — fields_total=0 → fill rate 0', () => {
  const result = aggregateCrossRunMetrics({
    category: 'mouse',
    runSummaries: [makeRun('r1', { fields_filled: 0, fields_total: 0 })],
  });
  assert.equal(result.field_fill_rate, 0);
  assert.equal(result.sparkline_data.fill_rate[0], 0);
});

test('crossRunMetrics — all fetched_blocked=0 → block rates 0', () => {
  const result = aggregateCrossRunMetrics({
    category: 'mouse',
    runSummaries: [makeRun('r1', { fetched_ok: 10, fetched_blocked: 0, fetched_error: 0 })],
  });
  assert.equal(result.sparkline_data.block_rate[0], 0);
});

test('crossRunMetrics — mixed blocked/ok/error → correct computation', () => {
  const result = aggregateCrossRunMetrics({
    category: 'mouse',
    runSummaries: [makeRun('r1', {
      fields_filled: 8,
      fields_total: 10,
      fetched_ok: 6,
      fetched_blocked: 3,
      fetched_error: 1,
      pages_checked: 10,
    })],
  });
  // fill_rate = 8/10 * 100 = 80
  assert.equal(result.field_fill_rate, 80);
  // block_rate = 3/(6+3+1) = 0.3 → 30
  assert.equal(result.sparkline_data.block_rate[0], 30);
});

test('crossRunMetrics — missing counters → defaults to 0', () => {
  const result = aggregateCrossRunMetrics({
    category: 'mouse',
    runSummaries: [{ run_id: 'r1', category: 'mouse' }],
  });
  assert.equal(result.field_fill_rate, 0);
  assert.equal(result.searches_per_product, 0);
  assert.equal(result.sparkline_data.fill_rate[0], 0);
});

test('crossRunMetrics — sparkline data chronologically ordered', () => {
  const runs = [
    makeRun('r1', { fields_filled: 5, fields_total: 20 }, '2026-01-03'),
    makeRun('r2', { fields_filled: 10, fields_total: 20 }, '2026-01-01'),
    makeRun('r3', { fields_filled: 15, fields_total: 20 }, '2026-01-02'),
  ];
  const result = aggregateCrossRunMetrics({ category: 'mouse', runSummaries: runs });
  // After sorting by started_at: r2 (25%), r3 (75%), r1 (25%)
  assert.deepEqual(result.sparkline_data.fill_rate, [50, 75, 25]);
});
