import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsMetricsRail } from '../runtimeOpsDataBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('crawler_stats event populates crawl_engine in metrics rail', () => {
  const events = [
    makeEvent('crawler_stats', {
      status_codes: { '200': 10, '403': 3, '429': 1 },
      retry_histogram: [8, 4, 2],
      top_errors: [[3, ['Error', 'blocked:status_403']], [1, ['Error', 'timeout']]],
      avg_ok_ms: 1200,
      avg_fail_ms: 8500,
    }),
  ];

  const result = buildRuntimeOpsMetricsRail(events, {});

  assert.ok(result.crawl_engine, 'crawl_engine section exists');
  assert.deepEqual(result.crawl_engine.status_codes, { '200': 10, '403': 3, '429': 1 });
  assert.deepEqual(result.crawl_engine.retry_histogram, [8, 4, 2]);
  assert.equal(result.crawl_engine.top_errors.length, 2);
  assert.equal(result.crawl_engine.avg_ok_ms, 1200);
  assert.equal(result.crawl_engine.avg_fail_ms, 8500);
});

test('metrics rail returns empty crawl_engine when no crawler_stats events', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com', worker_id: 'w1' }),
    makeEvent('fetch_finished', { url: 'https://a.com', worker_id: 'w1', status: 200 }),
  ];

  const result = buildRuntimeOpsMetricsRail(events, {});

  assert.ok(result.crawl_engine, 'crawl_engine section always present');
  assert.deepEqual(result.crawl_engine.status_codes, {});
  assert.deepEqual(result.crawl_engine.retry_histogram, []);
  assert.deepEqual(result.crawl_engine.top_errors, []);
  assert.equal(result.crawl_engine.avg_ok_ms, 0);
  assert.equal(result.crawl_engine.avg_fail_ms, 0);
});

test('latest crawler_stats event overwrites previous (last-write-wins)', () => {
  const events = [
    makeEvent('crawler_stats', {
      status_codes: { '200': 5 },
      retry_histogram: [5],
      top_errors: [],
      avg_ok_ms: 800,
      avg_fail_ms: 0,
    }, { ts: '2026-03-27T00:01:00.000Z' }),
    makeEvent('crawler_stats', {
      status_codes: { '200': 12, '403': 3 },
      retry_histogram: [10, 3, 2],
      top_errors: [[3, ['Error', 'blocked']]],
      avg_ok_ms: 1100,
      avg_fail_ms: 5000,
    }, { ts: '2026-03-27T00:02:00.000Z' }),
  ];

  const result = buildRuntimeOpsMetricsRail(events, {});

  assert.deepEqual(result.crawl_engine.status_codes, { '200': 12, '403': 3 }, 'latest snapshot wins');
  assert.deepEqual(result.crawl_engine.retry_histogram, [10, 3, 2]);
  assert.equal(result.crawl_engine.avg_ok_ms, 1100);
  assert.equal(result.crawl_engine.avg_fail_ms, 5000);
});
