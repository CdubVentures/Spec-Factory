import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWorkerDetail } from '../src/api/routes/runtimeOpsDataBuilders.js';

function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-001',
    ts: '2026-02-20T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}

test('buildWorkerDetail: returns empty arrays for unknown worker_id', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }),
  ];
  const result = buildWorkerDetail(events, 'fetch-999');
  assert.ok(result);
  assert.equal(result.worker_id, 'fetch-999');
  assert.ok(Array.isArray(result.documents));
  assert.equal(result.documents.length, 0);
  assert.ok(Array.isArray(result.extraction_fields));
  assert.equal(result.extraction_fields.length, 0);
  assert.ok(Array.isArray(result.queue_jobs));
  assert.equal(result.queue_jobs.length, 0);
});

test('buildWorkerDetail: correlates worker URLs with documents correctly', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'fetch-1', status_code: 200, bytes: 5000 }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'fetch-2' }, { ts: '2026-02-20T00:02:00.000Z' }),
  ];
  const result = buildWorkerDetail(events, 'fetch-1');
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].url, 'https://a.com/1');
});

test('buildWorkerDetail: extraction fields collected from source_processed events', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }),
    makeEvent('source_processed', {
      url: 'https://a.com/1',
      worker_id: 'fetch-1',
      candidates: [
        { field: 'weight', value: '60g', confidence: 0.9 },
        { field: 'sensor', value: 'PAW3950', confidence: 0.85 },
      ]
    }),
  ];
  const result = buildWorkerDetail(events, 'fetch-1');
  assert.equal(result.extraction_fields.length, 2);
  assert.equal(result.extraction_fields[0].field, 'weight');
  assert.equal(result.extraction_fields[0].value, '60g');
  assert.equal(result.extraction_fields[1].field, 'sensor');
});

test('buildWorkerDetail: queue jobs filtered by worker host', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('repair_query_enqueued', {
      dedupe_key: 'job-1',
      url: 'https://razer.com/viper-alt',
      reason: '404 on primary',
      lane: 'repair_search'
    }),
    makeEvent('repair_query_enqueued', {
      dedupe_key: 'job-2',
      url: 'https://other.com/page',
      reason: 'missing field',
      lane: 'repair_search'
    }),
  ];
  const result = buildWorkerDetail(events, 'fetch-1');
  assert.equal(result.queue_jobs.length, 1);
  assert.equal(result.queue_jobs[0].id, 'job-1');
  assert.equal(result.queue_jobs[0].host, 'razer.com');
});

test('buildWorkerDetail: includes screenshots from visual_asset_captured events', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://razer.com/viper', worker_id: 'fetch-1' }),
    makeEvent('visual_asset_captured', {
      url: 'https://razer.com/viper',
      worker_id: 'fetch-1',
      screenshot_uri: 'screenshots/viper.webp',
      width: 1920,
      height: 1080,
      bytes: 45000,
    }),
  ];
  const result = buildWorkerDetail(events, 'fetch-1');
  assert.ok(Array.isArray(result.screenshots));
  assert.equal(result.screenshots.length, 1);
  assert.equal(result.screenshots[0].url, 'https://razer.com/viper');
  assert.equal(result.screenshots[0].filename, 'screenshots/viper.webp');
});
