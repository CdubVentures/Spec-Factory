import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsMetricsRail } from '../runtimeOpsDataBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildRuntimeOpsMetricsRail: empty events returns the baseline shape', () => {
  const result = buildRuntimeOpsMetricsRail([], {});

  assert.ok(result && typeof result === 'object');
  assert.ok(result.pool_metrics && typeof result.pool_metrics === 'object');
  assert.ok(result.quality_metrics && typeof result.quality_metrics === 'object');
  assert.ok(result.failure_metrics && typeof result.failure_metrics === 'object');
});

test('buildRuntimeOpsMetricsRail: worker events populate pool metrics', () => {
  const now = Date.now();
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'w1' }, { ts: new Date(now - 5000).toISOString() }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'w1', status_code: 200 }, { ts: new Date(now - 3000).toISOString() }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'w2' }, { ts: new Date(now - 2000).toISOString() }),
    makeEvent('search_started', { query: 'test' }, { ts: new Date(now - 4000).toISOString() }),
    makeEvent('search_finished', { query: 'test', results: 5 }, { ts: new Date(now - 3500).toISOString() }),
  ];

  const result = buildRuntimeOpsMetricsRail(events, { nowMs: now });

  assert.ok(result.pool_metrics.fetch);
  assert.equal(result.pool_metrics.fetch.completed, 1);
  assert.equal(result.pool_metrics.fetch.active, 1);
  assert.ok(result.pool_metrics.search);
  assert.equal(result.pool_metrics.search.completed, 1);
});

test('buildRuntimeOpsMetricsRail: needset telemetry populates quality metrics', () => {
  const events = [
    makeEvent('needset_computed', {
      identity_status: 'locked',
      acceptance_rate: 0.85,
      mean_confidence: 0.78,
    }),
  ];

  const result = buildRuntimeOpsMetricsRail(events, {});

  assert.equal(result.quality_metrics.identity_status, 'locked');
  assert.equal(result.quality_metrics.acceptance_rate, 0.85);
  assert.equal(result.quality_metrics.mean_confidence, 0.78);
});

test('buildRuntimeOpsMetricsRail: fallback and scheduler events populate failure metrics and blocked hosts', () => {
  const events = [
    makeEvent('fetch_finished', { url: 'https://a.com/1', status_code: 403, fallback: true }),
    makeEvent('fetch_finished', { url: 'https://b.com/2', status_code: 200 }),
    makeEvent('fetch_finished', { url: 'https://blocked.com/1', status_code: 451 }),
    makeEvent('scheduler_fallback_started', { url: 'https://blocked.com/1', from_mode: 'playwright', to_mode: 'http', attempt: 1 }),
    makeEvent('fetch_finished', { url: 'https://blocked.com/2', status_code: 403 }),
    makeEvent('scheduler_fallback_started', { url: 'https://blocked.com/2', from_mode: 'http', to_mode: 'crawlee', attempt: 1 }),
  ];

  const result = buildRuntimeOpsMetricsRail(events, {});

  assert.equal(result.failure_metrics.total_fetches, 4);
  assert.equal(result.failure_metrics.fallback_count, 3);
  assert.ok(result.failure_metrics.fallback_rate > 0);
  assert.equal(result.failure_metrics.blocked_hosts, 2);
});
