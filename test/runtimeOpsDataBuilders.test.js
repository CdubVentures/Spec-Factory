import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRuntimeOpsSummary,
  buildRuntimeOpsWorkers,
  buildRuntimeOpsDocuments,
  buildRuntimeOpsDocumentDetail,
  buildRuntimeOpsMetricsRail,
} from '../src/api/routes/runtimeOpsDataBuilders.js';

function makeMeta(overrides = {}) {
  return {
    run_id: 'run-001',
    category: 'mouse',
    product_id: 'mouse-test-brand-model',
    started_at: '2026-02-20T00:00:00.000Z',
    ended_at: '2026-02-20T00:10:00.000Z',
    status: 'completed',
    round: 2,
    ...overrides,
  };
}

function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-001',
    ts: '2026-02-20T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}

test('buildRuntimeOpsSummary: empty events returns baseline shape with zeroed counters', () => {
  const result = buildRuntimeOpsSummary([], {});
  assert.ok(result && typeof result === 'object');
  assert.equal(result.status, 'unknown');
  assert.equal(result.round, 0);
  assert.equal(result.total_fetches, 0);
  assert.equal(result.total_parses, 0);
  assert.equal(result.total_llm_calls, 0);
  assert.equal(result.error_rate, 0);
  assert.equal(result.docs_per_min, 0);
  assert.equal(result.fields_per_min, 0);
  assert.ok(Array.isArray(result.top_blockers));
  assert.equal(result.top_blockers.length, 0);
});

test('buildRuntimeOpsSummary: extracts status and round from meta', () => {
  const result = buildRuntimeOpsSummary([], makeMeta({ status: 'running', round: 3 }));
  assert.equal(result.status, 'running');
  assert.equal(result.round, 3);
});

test('buildRuntimeOpsSummary: mixed fetch events produce correct counters and error_rate', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', status_code: 200 }),
    makeEvent('fetch_started', { url: 'https://b.com/2' }),
    makeEvent('fetch_finished', { url: 'https://b.com/2', status_code: 403 }),
    makeEvent('fetch_started', { url: 'https://c.com/3' }),
    makeEvent('fetch_finished', { url: 'https://c.com/3', status_code: 200 }),
    makeEvent('parse_started', { url: 'https://a.com/1' }),
    makeEvent('parse_finished', { url: 'https://a.com/1' }),
  ];
  const result = buildRuntimeOpsSummary(events, makeMeta());
  assert.equal(result.total_fetches, 3);
  assert.equal(result.total_parses, 1);
  assert.ok(result.error_rate > 0);
  assert.ok(result.error_rate < 1);
});

test('buildRuntimeOpsSummary: llm_started/finished events increment total_llm_calls', () => {
  const events = [
    makeEvent('llm_started', { batch_id: 'b1' }),
    makeEvent('llm_finished', { batch_id: 'b1' }),
    makeEvent('llm_started', { batch_id: 'b2' }),
    makeEvent('llm_finished', { batch_id: 'b2' }),
  ];
  const result = buildRuntimeOpsSummary(events, makeMeta());
  assert.equal(result.total_llm_calls, 2);
});

test('buildRuntimeOpsWorkers: empty events returns empty array', () => {
  const result = buildRuntimeOpsWorkers([], {});
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('buildRuntimeOpsWorkers: paired fetch_started/finished produces idle worker', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'w1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'w1', status_code: 200 }, { ts: '2026-02-20T00:01:05.000Z' }),
  ];
  const result = buildRuntimeOpsWorkers(events, {});
  assert.ok(result.length >= 1);
  const w1 = result.find((r) => r.worker_id === 'w1');
  assert.ok(w1);
  assert.equal(w1.state, 'idle');
});

test('buildRuntimeOpsWorkers: unmatched fetch_started beyond threshold marks worker stuck', () => {
  const now = Date.now();
  const startTs = new Date(now - 120_000).toISOString();
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'w2' }, { ts: startTs }),
  ];
  const result = buildRuntimeOpsWorkers(events, { stuckThresholdMs: 60_000, nowMs: now });
  assert.ok(result.length >= 1);
  const w2 = result.find((r) => r.worker_id === 'w2');
  assert.ok(w2);
  assert.equal(w2.state, 'stuck');
});

test('buildRuntimeOpsWorkers: unmatched fetch_started within threshold marks worker running', () => {
  const now = Date.now();
  const startTs = new Date(now - 10_000).toISOString();
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'w3' }, { ts: startTs }),
  ];
  const result = buildRuntimeOpsWorkers(events, { stuckThresholdMs: 60_000, nowMs: now });
  const w3 = result.find((r) => r.worker_id === 'w3');
  assert.ok(w3);
  assert.equal(w3.state, 'running');
});

test('buildRuntimeOpsDocuments: empty events returns empty array', () => {
  const result = buildRuntimeOpsDocuments([], {});
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test('buildRuntimeOpsDocuments: aggregates fetch+parse events into document rows keyed by URL', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/page1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/page1', status_code: 200, bytes: 5000 }, { ts: '2026-02-20T00:01:02.000Z' }),
    makeEvent('parse_started', { url: 'https://a.com/page1' }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/page1', parse_method: 'cheerio' }, { ts: '2026-02-20T00:01:04.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/page2' }, { ts: '2026-02-20T00:02:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://b.com/page2', status_code: 403 }, { ts: '2026-02-20T00:02:01.000Z' }),
  ];
  const result = buildRuntimeOpsDocuments(events, {});
  assert.equal(result.length, 2);
  assert.equal(result[0].url, 'https://b.com/page2');
  assert.equal(result[1].url, 'https://a.com/page1');
});

test('buildRuntimeOpsDocuments: newest-first ordering', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2' }, { ts: '2026-02-20T00:02:00.000Z' }),
    makeEvent('fetch_started', { url: 'https://c.com/3' }, { ts: '2026-02-20T00:03:00.000Z' }),
  ];
  const result = buildRuntimeOpsDocuments(events, {});
  assert.equal(result[0].url, 'https://c.com/3');
  assert.equal(result[2].url, 'https://a.com/1');
});

test('buildRuntimeOpsDocuments: limit param is respected', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2' }, { ts: '2026-02-20T00:02:00.000Z' }),
    makeEvent('fetch_started', { url: 'https://c.com/3' }, { ts: '2026-02-20T00:03:00.000Z' }),
  ];
  const result = buildRuntimeOpsDocuments(events, { limit: 2 });
  assert.equal(result.length, 2);
});

test('buildRuntimeOpsDocumentDetail: returns null for unknown URL', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1' }),
  ];
  const result = buildRuntimeOpsDocumentDetail(events, 'https://unknown.com/missing');
  assert.equal(result, null);
});

test('buildRuntimeOpsDocumentDetail: returns full lifecycle timeline for known URL', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/page', status_code: 200, bytes: 3000 }, { ts: '2026-02-20T00:01:02.000Z' }),
    makeEvent('parse_started', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com/page', parse_method: 'cheerio', candidates: 5 }, { ts: '2026-02-20T00:01:04.000Z' }),
    makeEvent('index_started', { url: 'https://a.com/page' }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('index_finished', { url: 'https://a.com/page', evidence_chunks: 3 }, { ts: '2026-02-20T00:01:06.000Z' }),
  ];
  const result = buildRuntimeOpsDocumentDetail(events, 'https://a.com/page');
  assert.ok(result);
  assert.equal(result.url, 'https://a.com/page');
  assert.ok(Array.isArray(result.timeline));
  assert.ok(result.timeline.length >= 3);
  assert.equal(result.status_code, 200);
  assert.equal(result.bytes, 3000);
  assert.equal(result.evidence_chunks, 3);
});

test('buildRuntimeOpsMetricsRail: empty events returns baseline shape', () => {
  const result = buildRuntimeOpsMetricsRail([], {});
  assert.ok(result && typeof result === 'object');
  assert.ok(result.pool_metrics && typeof result.pool_metrics === 'object');
  assert.ok(result.quality_metrics && typeof result.quality_metrics === 'object');
  assert.ok(result.failure_metrics && typeof result.failure_metrics === 'object');
});

test('buildRuntimeOpsMetricsRail: pool metrics from worker events', () => {
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

test('buildRuntimeOpsMetricsRail: quality metrics from needset_computed event', () => {
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

test('buildRuntimeOpsMetricsRail: failure metrics from fallback events', () => {
  const events = [
    makeEvent('fetch_finished', { url: 'https://a.com/1', status_code: 403, fallback: true }),
    makeEvent('fetch_finished', { url: 'https://b.com/2', status_code: 200 }),
    makeEvent('fetch_finished', { url: 'https://c.com/3', status_code: 503, fallback: true }),
  ];
  const result = buildRuntimeOpsMetricsRail(events, {});
  assert.equal(result.failure_metrics.total_fetches, 3);
  assert.equal(result.failure_metrics.fallback_count, 2);
  assert.ok(result.failure_metrics.fallback_rate > 0);
});

test('buildRuntimeOpsWorkers: search_started events produce worker with search pool', () => {
  const events = [
    makeEvent('search_started', { query: 'razer specs', worker_id: 'search-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('search_finished', { query: 'razer specs', worker_id: 'search-1', result_count: 10 }, { ts: '2026-02-20T00:01:05.000Z' }),
  ];
  const result = buildRuntimeOpsWorkers(events, {});
  assert.ok(result.length >= 1);
  const w = result.find((r) => r.worker_id === 'search-1');
  assert.ok(w, 'search worker should be tracked');
  assert.equal(w.pool, 'search');
  assert.equal(w.state, 'idle');
});

test('buildRuntimeOpsWorkers: llm_started events produce worker with llm pool', () => {
  const now = Date.now();
  const events = [
    makeEvent('llm_started', { batch_id: 'b1', worker_id: 'llm-b1' }, { ts: new Date(now - 5000).toISOString() }),
  ];
  const result = buildRuntimeOpsWorkers(events, { nowMs: now });
  assert.ok(result.length >= 1);
  const w = result.find((r) => r.worker_id === 'llm-b1');
  assert.ok(w, 'LLM worker should be tracked');
  assert.equal(w.pool, 'llm');
  assert.equal(w.state, 'running');
});

test('buildRuntimeOpsWorkers: parse_started events produce worker with parse pool', () => {
  const now = Date.now();
  const events = [
    makeEvent('parse_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: new Date(now - 3000).toISOString() }),
    makeEvent('parse_finished', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: new Date(now - 1000).toISOString() }),
  ];
  const result = buildRuntimeOpsWorkers(events, { nowMs: now });
  const w = result.find((r) => r.worker_id === 'fetch-1');
  assert.ok(w, 'parse worker should be tracked');
  assert.equal(w.stage, 'parse');
});

test('buildRuntimeOpsWorkers: stage is set correctly per event type', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'fetch-1', status_code: 200 }, { ts: '2026-02-20T00:01:05.000Z' }),
  ];
  const result = buildRuntimeOpsWorkers(events, {});
  const w = result.find((r) => r.worker_id === 'fetch-1');
  assert.ok(w);
  assert.equal(w.stage, 'fetch');
});

test('buildRuntimeOpsWorkers: docs_processed increments on fetch_finished', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'fetch-1', status_code: 200 }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:06.000Z' }),
    makeEvent('fetch_finished', { url: 'https://b.com/2', worker_id: 'fetch-1', status_code: 200 }, { ts: '2026-02-20T00:01:10.000Z' }),
  ];
  const result = buildRuntimeOpsWorkers(events, {});
  const w = result.find((r) => r.worker_id === 'fetch-1');
  assert.ok(w);
  assert.equal(w.docs_processed, 2);
});

test('buildRuntimeOpsWorkers: fields_extracted increments on source_processed candidates', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('source_processed', {
      url: 'https://a.com/1',
      worker_id: 'fetch-1',
      candidates: [
        { field: 'weight', value: '60g' },
        { field: 'sensor', value: 'PAW3950' },
      ]
    }, { ts: '2026-02-20T00:01:05.000Z' }),
  ];
  const result = buildRuntimeOpsWorkers(events, {});
  const w = result.find((r) => r.worker_id === 'fetch-1');
  assert.ok(w);
  assert.equal(w.fields_extracted, 2);
});

test('buildRuntimeOpsSummary: top_blockers populated from error events', () => {
  const events = [
    makeEvent('fetch_finished', { url: 'https://blocked.com/1', status_code: 403, error: 'forbidden' }),
    makeEvent('fetch_finished', { url: 'https://blocked.com/2', status_code: 403, error: 'forbidden' }),
    makeEvent('fetch_finished', { url: 'https://other.com/1', status_code: 200 }),
  ];
  const result = buildRuntimeOpsSummary(events, makeMeta());
  assert.ok(result.top_blockers.length >= 1);
  assert.equal(result.top_blockers[0].host, 'blocked.com');
});
