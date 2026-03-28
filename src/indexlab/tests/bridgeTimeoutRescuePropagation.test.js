import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { finishFetchUrl } from '../runtimeBridgeArtifacts.js';

/**
 * Fix 1 (bridge layer): finishFetchUrl must accept and emit
 * timeout_rescued flag so the GUI can distinguish rescued
 * fetches from genuine failures.
 */

function makeState() {
  const emitted = [];
  return {
    runId: 'run-001',
    context: { category: 'mouse', productId: 'test-mouse' },
    fetchByUrl: new Map(),
    fetchClosedByUrl: new Set(),
    workerByUrl: new Map(),
    counters: { fetched_ok: 0, fetched_404: 0, fetched_blocked: 0, fetched_error: 0 },
    specDb: null,
    onEvent(row) { emitted.push(row); },
    stageState: {},
    emitted,
  };
}

describe('finishFetchUrl timeout_rescued propagation', () => {
  it('emits timeout_rescued: true in fetch_finished payload when flag is set', async () => {
    const state = makeState();
    state.fetchByUrl.set('https://a.com', { started_at: '2026-03-27T00:00:00Z', worker_id: 'fetch-1' });

    await finishFetchUrl(state, {
      url: 'https://a.com',
      ts: '2026-03-27T00:00:45Z',
      status: 0,
      error: 'requestHandler timed out after 45 seconds.',
      timeoutRescued: true,
    });

    const fetchFinished = state.emitted.find((e) => e.event === 'fetch_finished');
    assert.ok(fetchFinished, 'fetch_finished event emitted');
    assert.equal(fetchFinished.payload.timeout_rescued, true, 'timeout_rescued must be in payload');
    assert.equal(fetchFinished.payload.status, 0);
    assert.equal(fetchFinished.payload.worker_id, 'fetch-1');
  });

  it('does NOT emit timeout_rescued when flag is not set', async () => {
    const state = makeState();
    state.fetchByUrl.set('https://b.com', { started_at: '2026-03-27T00:00:00Z', worker_id: 'fetch-2' });

    await finishFetchUrl(state, {
      url: 'https://b.com',
      ts: '2026-03-27T00:00:45Z',
      status: 0,
      error: 'Navigation timed out',
    });

    const fetchFinished = state.emitted.find((e) => e.event === 'fetch_finished');
    assert.ok(fetchFinished);
    assert.equal(fetchFinished.payload.timeout_rescued, undefined, 'no flag when not rescued');
  });

  it('does NOT emit timeout_rescued when explicitly false', async () => {
    const state = makeState();
    state.fetchByUrl.set('https://c.com', { started_at: '2026-03-27T00:00:00Z', worker_id: 'fetch-3' });

    await finishFetchUrl(state, {
      url: 'https://c.com',
      ts: '2026-03-27T00:00:45Z',
      status: 403,
      error: 'blocked:status_403',
      timeoutRescued: false,
    });

    const fetchFinished = state.emitted.find((e) => e.event === 'fetch_finished');
    assert.ok(fetchFinished);
    assert.equal(fetchFinished.payload.timeout_rescued, undefined, 'false = omit from payload');
  });
});
