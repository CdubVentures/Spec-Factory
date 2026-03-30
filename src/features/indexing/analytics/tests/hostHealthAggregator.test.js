import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateHostHealth } from '../hostHealthAggregator.js';

// ── helpers ─────────────────────────────────────────────────
function urlRow(host, fetchSuccess, fieldsFilled = 1, runId = 'r1') {
  return {
    url: `https://${host}/page-${Math.random().toString(36).slice(2, 6)}`,
    host,
    tier: 1,
    fields_filled: Array.from({ length: fieldsFilled }, (_, i) => `field_${i}`),
    fetch_success: fetchSuccess,
    run_id: runId,
    ts: new Date().toISOString(),
  };
}

// ── tests ───────────────────────────────────────────────────
test('hostHealth — no urlRows → empty array', () => {
  const result = aggregateHostHealth({ category: 'mouse' });
  assert.deepEqual(result, []);
});

test('hostHealth — empty urlRows → empty array', () => {
  const result = aggregateHostHealth({ category: 'mouse', urlRows: [] });
  assert.deepEqual(result, []);
});

test('hostHealth — all successful → healthy status', () => {
  const result = aggregateHostHealth({
    category: 'mouse',
    urlRows: [
      urlRow('razer.com', true, 3),
      urlRow('razer.com', true, 2),
      urlRow('razer.com', true, 4),
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].host, 'razer.com');
  assert.equal(result[0].status, 'healthy');
  assert.equal(result[0].block_rate, 0);
  assert.equal(result[0].total, 3);
  assert.equal(result[0].avg_fields_per_fetch, 3);
});

test('hostHealth — ≥80% failures → blocked status', () => {
  const result = aggregateHostHealth({
    category: 'mouse',
    urlRows: [
      urlRow('blocked.com', false),
      urlRow('blocked.com', false),
      urlRow('blocked.com', false),
      urlRow('blocked.com', false),
      urlRow('blocked.com', true),
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'blocked');
  assert.equal(result[0].block_rate, 0.8);
});

test('hostHealth — multiple hosts mixed → correct per-host status', () => {
  const result = aggregateHostHealth({
    category: 'mouse',
    urlRows: [
      // healthy.com: 0/3 failed → healthy
      urlRow('healthy.com', true), urlRow('healthy.com', true), urlRow('healthy.com', true),
      // degraded.com: 2/5 failed → 40% → degraded
      urlRow('degraded.com', false), urlRow('degraded.com', false),
      urlRow('degraded.com', true), urlRow('degraded.com', true), urlRow('degraded.com', true),
      // blocked.com: 9/10 failed → 90% → blocked
      ...Array.from({ length: 9 }, () => urlRow('blocked.com', false)),
      urlRow('blocked.com', true),
    ],
  });
  assert.equal(result.length, 3);
  // Sorted by block_rate DESC
  assert.equal(result[0].host, 'blocked.com');
  assert.equal(result[0].status, 'blocked');
  assert.equal(result[1].host, 'degraded.com');
  assert.equal(result[1].status, 'degraded');
  assert.equal(result[2].host, 'healthy.com');
  assert.equal(result[2].status, 'healthy');
});
