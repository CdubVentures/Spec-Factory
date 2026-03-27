import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsWorkers } from '../runtimeOpsWorkerPoolBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

/**
 * Worker states derived from Crawlee's RequestState enum.
 * 6 fetch states: queued, crawling, retrying, crawled, failed, skipped
 * Plus: stuck (elapsed time), running/idle (non-fetch pools)
 *
 * Error sub-reasons (captcha, blocked, rate_limited) are metadata on
 * last_error/block_reason, NOT separate badge states.
 */

test('200 OK → crawled', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://rtings.com/mouse', worker_id: 'fetch-1' }),
    makeEvent('fetch_finished', { url: 'https://rtings.com/mouse', worker_id: 'fetch-1', status: 200 }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-1');
  assert.equal(w.state, 'crawled');
  assert.equal(w.last_error, null);
});

test('403 → failed (not "blocked" badge)', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://shi.com/product', worker_id: 'fetch-2' }),
    makeEvent('fetch_finished', { url: 'https://shi.com/product', worker_id: 'fetch-2', status: 403 }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-2');
  assert.equal(w.state, 'failed', '403 is failed — no separate blocked badge');
  assert.ok(w.last_error, 'error message preserved as metadata');
});

test('429 → failed (not "rate_limited" badge)', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://api.example.com', worker_id: 'fetch-3' }),
    makeEvent('fetch_finished', { url: 'https://api.example.com', worker_id: 'fetch-3', status: 429 }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-3');
  assert.equal(w.state, 'failed', '429 is failed — no separate rate_limited badge');
});

test('blocked:captcha_detected error → failed with error in last_error', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://reddit.com/r/test', worker_id: 'fetch-4' }),
    makeEvent('fetch_finished', { url: 'https://reddit.com/r/test', worker_id: 'fetch-4', status: 0, error: 'blocked:captcha_detected' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-4');
  assert.equal(w.state, 'failed', 'captcha is failed — no separate captcha badge');
  assert.ok(w.last_error, 'error preserved in last_error');
});

test('timeout_rescued → failed (rescue flag is metadata, not badge state)', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://slow.com', worker_id: 'fetch-5' }),
    makeEvent('fetch_finished', { url: 'https://slow.com', worker_id: 'fetch-5', status: 0, error: 'requestHandler timed out', timeout_rescued: true }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-5');
  assert.equal(w.state, 'failed', 'timeout rescue is failed — detail panel shows rescue info');
});

test('status 0 with no error → failed', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://dead.com', worker_id: 'fetch-6' }),
    makeEvent('fetch_finished', { url: 'https://dead.com', worker_id: 'fetch-6', status: 0 }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-6');
  assert.equal(w.state, 'failed');
});

test('parse_finished after fetch_finished does NOT change fetch state', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://shi.com', worker_id: 'fetch-7' }, { ts: '2026-03-27T00:00:00Z' }),
    makeEvent('fetch_finished', { url: 'https://shi.com', worker_id: 'fetch-7', status: 403 }, { ts: '2026-03-27T00:00:05Z' }),
    makeEvent('source_processed', { url: 'https://shi.com', worker_id: 'fetch-7', status: 403 }, { ts: '2026-03-27T00:00:06Z' }),
    makeEvent('parse_finished', { url: 'https://shi.com', worker_id: 'fetch-7' }, { ts: '2026-03-27T00:00:07Z' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-7');
  assert.equal(w.state, 'failed', 'parse_finished does not overwrite failed→crawled');
});

test('parse_finished after successful fetch does NOT change crawled state', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://rtings.com', worker_id: 'fetch-8' }, { ts: '2026-03-27T00:00:00Z' }),
    makeEvent('fetch_finished', { url: 'https://rtings.com', worker_id: 'fetch-8', status: 200 }, { ts: '2026-03-27T00:00:05Z' }),
    makeEvent('parse_finished', { url: 'https://rtings.com', worker_id: 'fetch-8' }, { ts: '2026-03-27T00:00:06Z' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-8');
  assert.equal(w.state, 'crawled', 'stays crawled — parse_finished ignored for fetch workers');
});

test('non-fetch worker: parse_finished sets idle normally', () => {
  const events = [
    makeEvent('parse_started', { url: 'https://a.com', worker_id: 'parse-1' }),
    makeEvent('parse_finished', { url: 'https://a.com', worker_id: 'parse-1' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'parse-1');
  assert.equal(w.state, 'idle', 'non-fetch workers still go idle on finish');
});

test('stuck detection still works', () => {
  const now = Date.now();
  const events = [
    makeEvent('fetch_started', { url: 'https://a.com', worker_id: 'fetch-stuck' }, { ts: new Date(now - 120000).toISOString() }),
  ];
  const w = buildRuntimeOpsWorkers(events, { stuckThresholdMs: 60000, nowMs: now }).find((r) => r.worker_id === 'fetch-stuck');
  assert.equal(w.state, 'stuck');
});
