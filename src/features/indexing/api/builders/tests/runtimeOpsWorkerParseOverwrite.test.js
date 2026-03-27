import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsWorkers } from '../runtimeOpsWorkerPoolBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

/**
 * Simplified: for fetch workers, only fetch_finished sets state.
 * parse_finished/index_finished are completely ignored.
 */

test('parse_finished does not change failed fetch state', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://shi.com', worker_id: 'fetch-5' }, { ts: '2026-03-27T19:00:00Z' }),
    makeEvent('fetch_finished', { url: 'https://shi.com', worker_id: 'fetch-5', status: 403 }, { ts: '2026-03-27T19:00:05Z' }),
    makeEvent('source_processed', { url: 'https://shi.com', worker_id: 'fetch-5', status: 403 }, { ts: '2026-03-27T19:00:06Z' }),
    makeEvent('parse_finished', { url: 'https://shi.com', worker_id: 'fetch-5' }, { ts: '2026-03-27T19:00:07Z' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-5');
  assert.equal(w.state, 'failed');
});

test('parse_finished does not change crawled fetch state', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://rtings.com', worker_id: 'fetch-6' }, { ts: '2026-03-27T19:00:00Z' }),
    makeEvent('fetch_finished', { url: 'https://rtings.com', worker_id: 'fetch-6', status: 200 }, { ts: '2026-03-27T19:00:05Z' }),
    makeEvent('parse_finished', { url: 'https://rtings.com', worker_id: 'fetch-6' }, { ts: '2026-03-27T19:00:06Z' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-6');
  assert.equal(w.state, 'crawled');
});

test('parse_finished sets idle for parse pool workers normally', () => {
  const events = [
    makeEvent('parse_started', { url: 'https://a.com', worker_id: 'parse-1' }),
    makeEvent('parse_finished', { url: 'https://a.com', worker_id: 'parse-1' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'parse-1');
  assert.equal(w.state, 'idle');
});
