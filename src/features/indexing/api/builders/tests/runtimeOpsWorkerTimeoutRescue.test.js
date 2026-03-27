import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsWorkers } from '../runtimeOpsWorkerPoolBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

/**
 * Fix 1 (GUI side): When fetch_finished carries timeout_rescued: true,
 * the worker state should be 'timeout_rescued' (yellow warning badge)
 * instead of 'failed' (red danger badge).
 */

test('timeout_rescued worker gets state "timeout_rescued" instead of "failed"', () => {
  const events = [
    makeEvent('fetch_started', {
      url: 'https://www.amazon.com/product/123',
      worker_id: 'fetch-1',
      fetcher_kind: 'crawlee',
    }, { ts: '2026-03-27T00:01:00.000Z' }),
    makeEvent('fetch_finished', {
      url: 'https://www.amazon.com/product/123',
      worker_id: 'fetch-1',
      status: 0,
      error: 'requestHandler timed out after 45 seconds.',
      timeout_rescued: true,
    }, { ts: '2026-03-27T00:01:45.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-1');

  assert.ok(w, 'worker exists');
  assert.equal(w.state, 'timeout_rescued', 'should be timeout_rescued, not failed');
  assert.ok(w.last_error, 'last_error still set for detail panel');
});

test('timeout_rescued worker still shows as timeout_rescued even with status 0', () => {
  const events = [
    makeEvent('fetch_started', {
      url: 'https://slow-site.com/page',
      worker_id: 'fetch-2',
    }, { ts: '2026-03-27T00:02:00.000Z' }),
    makeEvent('fetch_finished', {
      url: 'https://slow-site.com/page',
      worker_id: 'fetch-2',
      status: 0,
      error: 'requestHandler timed out after 45 seconds.',
      timeout_rescued: true,
    }, { ts: '2026-03-27T00:02:45.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-2');

  assert.equal(w.state, 'timeout_rescued');
});

test('non-rescued timeout still shows as failed', () => {
  const events = [
    makeEvent('fetch_started', {
      url: 'https://crashed-site.com',
      worker_id: 'fetch-3',
    }, { ts: '2026-03-27T00:03:00.000Z' }),
    makeEvent('fetch_finished', {
      url: 'https://crashed-site.com',
      worker_id: 'fetch-3',
      status: 0,
      error: 'requestHandler timed out after 45 seconds.',
      // NO timeout_rescued flag
    }, { ts: '2026-03-27T00:03:45.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-3');

  assert.equal(w.state, 'failed', 'without rescue flag, status 0 = failed');
});

test('blocked pages are NOT affected by timeout_rescued', () => {
  const events = [
    makeEvent('fetch_started', {
      url: 'https://shop.asus.com/product',
      worker_id: 'fetch-4',
    }, { ts: '2026-03-27T00:04:00.000Z' }),
    makeEvent('fetch_finished', {
      url: 'https://shop.asus.com/product',
      worker_id: 'fetch-4',
      status: 403,
      error: 'blocked:status_403',
      // Even if someone set timeout_rescued, blocked takes priority
    }, { ts: '2026-03-27T00:04:05.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-4');

  assert.equal(w.state, 'blocked', 'blocked status takes priority');
});

test('timeout_rescued with 200 status shows as crawled (normal success path)', () => {
  const events = [
    makeEvent('fetch_started', {
      url: 'https://normal-site.com/page',
      worker_id: 'fetch-5',
    }, { ts: '2026-03-27T00:05:00.000Z' }),
    makeEvent('fetch_finished', {
      url: 'https://normal-site.com/page',
      worker_id: 'fetch-5',
      status: 200,
      timeout_rescued: true,
    }, { ts: '2026-03-27T00:05:30.000Z' }),
  ];

  const workers = buildRuntimeOpsWorkers(events, {});
  const w = workers.find((r) => r.worker_id === 'fetch-5');

  assert.equal(w.state, 'crawled', 'status 200 = crawled regardless of rescue flag');
});
