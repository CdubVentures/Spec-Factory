import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsWorkers } from '../runtimeOpsWorkerPoolBuilders.js';
import { makeEvent } from './fixtures/runtimeOpsDataBuildersHarness.js';

/**
 * Simplified: timeout_rescued and blocked are NOT badge states.
 * All non-2xx fetches → 'failed'. Error details in last_error/block_reason metadata.
 */

test('timeout with rescue flag → failed (rescue is metadata, not badge)', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://slow.com', worker_id: 'fetch-1' }),
    makeEvent('fetch_finished', { url: 'https://slow.com', worker_id: 'fetch-1', status: 0, error: 'requestHandler timed out', timeout_rescued: true }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-1');
  assert.equal(w.state, 'failed');
  assert.ok(w.last_error.includes('timed out'));
});

test('timeout without rescue flag → failed', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://dead.com', worker_id: 'fetch-2' }),
    makeEvent('fetch_finished', { url: 'https://dead.com', worker_id: 'fetch-2', status: 0, error: 'requestHandler timed out' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-2');
  assert.equal(w.state, 'failed');
});

test('403 → failed with error in last_error', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://shop.asus.com', worker_id: 'fetch-3' }),
    makeEvent('fetch_finished', { url: 'https://shop.asus.com', worker_id: 'fetch-3', status: 403, error: 'blocked:status_403' }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-3');
  assert.equal(w.state, 'failed');
  assert.ok(w.last_error, 'error preserved in last_error');
});

test('200 OK → crawled regardless of any flags', () => {
  const events = [
    makeEvent('fetch_started', { url: 'https://ok.com', worker_id: 'fetch-4' }),
    makeEvent('fetch_finished', { url: 'https://ok.com', worker_id: 'fetch-4', status: 200, timeout_rescued: true }),
  ];
  const w = buildRuntimeOpsWorkers(events, {}).find((r) => r.worker_id === 'fetch-4');
  assert.equal(w.state, 'crawled');
});
