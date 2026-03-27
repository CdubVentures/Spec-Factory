import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsWorkers } from '../runtimeOpsDataBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildRuntimeOpsWorkers: empty events returns no workers', () => {
  const result = buildRuntimeOpsWorkers([], {});
  assert.deepEqual(result, []);
});

test('buildRuntimeOpsWorkers: fetch lifecycle rows use crawled/failed states', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'w1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'w1', status: 200 }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'w2' }, { ts: '2026-02-20T00:02:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://b.com/2', worker_id: 'w2', status: 403 }, { ts: '2026-02-20T00:02:05.000Z' }),
  ];

  const result = buildRuntimeOpsWorkers(events, {});
  const okWorker = result.find((row) => row.worker_id === 'w1');
  const failedWorker = result.find((row) => row.worker_id === 'w2');

  assert.equal(okWorker?.state, 'crawled');
  assert.equal(okWorker?.last_error, null);
  assert.equal(failedWorker?.state, 'failed');
  assert.equal(failedWorker?.last_error, 'HTTP 403');
});

test('buildRuntimeOpsWorkers: unmatched fetch rows distinguish crawling from stuck by threshold', () => {
  const now = Date.now();
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'stuck-worker' }, { ts: new Date(now - 120000).toISOString() }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'crawling-worker' }, { ts: new Date(now - 10000).toISOString() }),
  ];

  const result = buildRuntimeOpsWorkers(events, { stuckThresholdMs: 60000, nowMs: now });
  const stuckWorker = result.find((row) => row.worker_id === 'stuck-worker');
  const crawlingWorker = result.find((row) => row.worker_id === 'crawling-worker');

  assert.equal(stuckWorker?.state, 'stuck');
  assert.equal(crawlingWorker?.state, 'crawling');
});

test('buildRuntimeOpsWorkers: worker family and stage are derived from the event type', () => {
  const now = Date.now();
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'fetch-1', status_code: 200 }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('parse_started', { url: 'https://a.com/2', worker_id: 'parse-1' }, { ts: new Date(now - 3000).toISOString() }),
    makeEvent('parse_finished', { url: 'https://a.com/2', worker_id: 'parse-1' }, { ts: new Date(now - 1000).toISOString() }),
    makeEvent('llm_started', { batch_id: 'b1', worker_id: 'llm-b1' }, { ts: new Date(now - 5000).toISOString() }),
  ];

  const result = buildRuntimeOpsWorkers(events, { nowMs: now });
  const fetchWorker = result.find((row) => row.worker_id === 'fetch-1');
  const parseWorker = result.find((row) => row.worker_id === 'parse-1');
  const llmWorker = result.find((row) => row.worker_id === 'llm-b1');

  assert.equal(fetchWorker?.pool, 'fetch');
  assert.equal(fetchWorker?.stage, 'fetch');
  assert.equal(parseWorker?.pool, 'parse');
  assert.equal(parseWorker?.stage, 'parse');
  assert.equal(llmWorker?.pool, 'llm');
  assert.equal(llmWorker?.state, 'running');
});

test('buildRuntimeOpsWorkers: docs_processed counts completed urls once even when later stages arrive', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://a.com/1', worker_id: 'fetch-1', status_code: 200 }, { ts: '2026-02-20T00:01:02.000Z' }),
    makeEvent('source_processed', {
      url: 'https://a.com/1',
      worker_id: 'fetch-1',
      status: 200,
      content_type: 'text/html',
    }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('index_finished', {
      url: 'https://a.com/1',
      worker_id: 'fetch-1',
      count: 2,
      filled_fields: ['weight', 'sensor'],
    }, { ts: '2026-02-20T00:01:04.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'fetch-1' }, { ts: '2026-02-20T00:01:06.000Z' }),
    makeEvent('fetch_finished', { url: 'https://b.com/2', worker_id: 'fetch-1', status_code: 200 }, { ts: '2026-02-20T00:01:10.000Z' }),
  ];

  const result = buildRuntimeOpsWorkers(events, {});
  const worker = result.find((row) => row.worker_id === 'fetch-1');

  assert.ok(worker);
  assert.equal(worker.docs_processed, 2);
});

test('buildRuntimeOpsWorkers: fields_extracted backfills from candidates index results and source packets', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com/1', worker_id: 'inline-worker' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('source_processed', {
      url: 'https://a.com/1',
      worker_id: 'inline-worker',
      candidates: [
        { field: 'weight', value: '60g' },
        { field: 'sensor', value: 'PAW3950' },
      ],
    }, { ts: '2026-02-20T00:01:05.000Z' }),
    makeEvent('fetch_started', { url: 'https://b.com/2', worker_id: 'index-worker' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('source_processed', {
      url: 'https://b.com/2',
      worker_id: 'index-worker',
      status: 200,
      candidate_count: 650,
    }, { ts: '2026-02-20T00:01:03.000Z' }),
    makeEvent('index_finished', {
      url: 'https://b.com/2',
      worker_id: 'index-worker',
      count: 3,
      filled_fields: ['weight', 'sensor', 'polling_rate'],
    }, { ts: '2026-02-20T00:01:04.000Z' }),
    makeEvent('fetch_started', { url: 'https://support.example.com/specs/mouse-pro', worker_id: 'packet-worker' }, { ts: '2026-02-20T00:01:00.000Z' }),
    makeEvent('source_processed', {
      url: 'https://support.example.com/specs/mouse-pro',
      worker_id: 'packet-worker',
      status: 200,
      candidate_count: 650,
    }, { ts: '2026-02-20T00:01:03.000Z' }),
  ];
  const sourceIndexingPacketCollection = {
    packets: [
      {
        canonical_url: 'https://support.example.com/specs/mouse-pro',
        field_key_map: {
          weight: { contexts: [] },
          sensor: { contexts: [] },
          polling_rate: { contexts: [] },
        },
      },
    ],
  };

  const result = buildRuntimeOpsWorkers(events, { sourceIndexingPacketCollection });
  const inlineWorker = result.find((row) => row.worker_id === 'inline-worker');
  const indexWorker = result.find((row) => row.worker_id === 'index-worker');
  const packetWorker = result.find((row) => row.worker_id === 'packet-worker');

  assert.equal(inlineWorker?.fields_extracted, 2);
  assert.equal(indexWorker?.fields_extracted, 3);
  assert.equal(packetWorker?.fields_extracted, 3);
});
