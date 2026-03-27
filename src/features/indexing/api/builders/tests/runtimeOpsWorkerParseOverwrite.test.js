import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsWorkers } from '../runtimeOpsWorkerPoolBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

/**
 * Bug: parse_finished overwrites blocked/failed fetch state back to 'crawled'.
 *
 * Sequence: fetch_finished (403, blocked) → source_processed → parse_finished
 * The parse_finished event is an isFinishEvent, so line 354 resets state to
 * 'crawled' and line 355 clears block_reason. The worker shows green "crawled"
 * badge when it was actually blocked.
 */

test('parse_finished does NOT overwrite blocked fetch state', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://www.shi.com/product/123', worker_id: 'fetch-5' }, { ts: '2026-03-27T19:00:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://www.shi.com/product/123', worker_id: 'fetch-5', status: 403 }, { ts: '2026-03-27T19:00:05.000Z' }),
    makeEvent('source_processed', { url: 'https://www.shi.com/product/123', worker_id: 'fetch-5', status: 403 }, { ts: '2026-03-27T19:00:06.000Z' }),
    makeEvent('parse_finished', { url: 'https://www.shi.com/product/123', worker_id: 'fetch-5' }, { ts: '2026-03-27T19:00:07.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-5');

  assert.equal(w.state, 'blocked', 'parse_finished must not overwrite blocked state to crawled');
});

test('parse_finished does NOT overwrite failed fetch state', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://example.com', worker_id: 'fetch-6' }, { ts: '2026-03-27T19:00:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://example.com', worker_id: 'fetch-6', status: 0, error: 'requestHandler timed out' }, { ts: '2026-03-27T19:00:45.000Z' }),
    makeEvent('source_processed', { url: 'https://example.com', worker_id: 'fetch-6', status: 0 }, { ts: '2026-03-27T19:00:46.000Z' }),
    makeEvent('parse_finished', { url: 'https://example.com', worker_id: 'fetch-6' }, { ts: '2026-03-27T19:00:47.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-6');

  assert.equal(w.state, 'failed', 'parse_finished must not overwrite failed state to crawled');
});

test('parse_finished does NOT overwrite captcha fetch state', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://reddit.com/r/test', worker_id: 'fetch-7' }, { ts: '2026-03-27T19:00:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://reddit.com/r/test', worker_id: 'fetch-7', status: 0, error: 'blocked:captcha_detected' }, { ts: '2026-03-27T19:00:05.000Z' }),
    makeEvent('parse_finished', { url: 'https://reddit.com/r/test', worker_id: 'fetch-7' }, { ts: '2026-03-27T19:00:06.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-7');

  assert.equal(w.state, 'captcha', 'parse_finished must not overwrite captcha state');
});

test('parse_finished does NOT overwrite timeout_rescued fetch state', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://slow.com', worker_id: 'fetch-8' }, { ts: '2026-03-27T19:00:00.000Z' }),
    makeEvent('fetch_finished', { url: 'https://slow.com', worker_id: 'fetch-8', status: 0, error: 'requestHandler timed out', timeout_rescued: true }, { ts: '2026-03-27T19:00:45.000Z' }),
    makeEvent('parse_finished', { url: 'https://slow.com', worker_id: 'fetch-8' }, { ts: '2026-03-27T19:00:46.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-8');

  assert.equal(w.state, 'timeout_rescued', 'parse_finished must not overwrite timeout_rescued state');
});

test('parse_finished CAN set idle for non-fetch workers (parse pool)', () => {
  const events = [
    makeEvent('parse_started', { url: 'https://a.com', worker_id: 'parse-1' }, { ts: '2026-03-27T19:00:00.000Z' }),
    makeEvent('parse_finished', { url: 'https://a.com', worker_id: 'parse-1' }, { ts: '2026-03-27T19:00:01.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'parse-1');

  assert.equal(w.state, 'idle', 'parse workers should go idle on parse_finished');
});
