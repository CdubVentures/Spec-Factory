import test from 'node:test';
import assert from 'node:assert/strict';

import { handleIndexLabProcessCompletion } from '../indexLabProcessCompletion.js';

test('indexlab completion ignores non-indexlab commands', async () => {
  const result = await handleIndexLabProcessCompletion({
    exitCode: 0,
    cliArgs: ['category-compile', '--category', 'mouse'],
  });

  assert.equal(result, null);
});

test('indexlab completion returns null for successful indexlab runs', async () => {
  const result = await handleIndexLabProcessCompletion({
    exitCode: 0,
    cliArgs: ['indexlab', '--local', '--category', 'mouse', '--product-id', 'mouse-razer-viper-v3-pro'],
    startedAt: '2026-02-24T00:00:01.000Z',
    broadcastWs: () => {},
    logError: () => {},
  });

  assert.equal(result, null);
});

test('indexlab completion reconciles interrupted runs via SQL', async () => {
  const runId = 'run-interrupted-001';
  const category = 'mouse';

  const upsertRunCalls = [];
  const insertBridgeEventCalls = [];
  const fakeSpecDb = {
    getRunByRunId: (id) => id === runId ? {
      run_id: runId,
      category,
      product_id: 'mouse-razer-viper-v3-pro',
      status: 'running',
      started_at: '2026-02-24T00:00:00.000Z',
      ended_at: '',
      counters: {},
    } : null,
    getBridgeEventsByRunId: () => [
      { event: 'fetch_started', ts: '2026-02-24T00:00:05.000Z' },
    ],
    insertBridgeEvent: (row) => insertBridgeEventCalls.push(row),
    upsertRun: (row) => upsertRunCalls.push(row),
    updateRunStorageLocation: () => {},
  };

  const result = await handleIndexLabProcessCompletion({
    exitCode: null,
    cliArgs: ['indexlab', '--local', '--run-id', runId, '--category', category, '--product-id', 'mouse-razer-viper-v3-pro'],
    startedAt: '2026-02-24T00:00:01.000Z',
    broadcastWs: () => {},
    logError: () => {},
    getSpecDb: () => fakeSpecDb,
  });

  assert.equal(result, null);
  assert.equal(upsertRunCalls.length, 1);
  assert.equal(upsertRunCalls[0].status, 'failed');
  assert.equal(insertBridgeEventCalls.length, 1);
  assert.equal(insertBridgeEventCalls[0].event, 'error');
});

test('indexlab completion returns null when no SQL record exists for interrupted run', async () => {
  const fakeSpecDb = {
    getRunByRunId: () => null,
    getBridgeEventsByRunId: () => [],
    updateRunStorageLocation: () => {},
  };

  const result = await handleIndexLabProcessCompletion({
    exitCode: 1,
    cliArgs: ['indexlab', '--local', '--run-id', 'run-unknown-001', '--category', 'monitor', '--product-id', 'monitor-dell-u2724d'],
    startedAt: '2026-02-24T00:00:01.000Z',
    broadcastWs: () => {},
    logError: () => {},
    getSpecDb: () => fakeSpecDb,
  });

  assert.equal(result, null);
});
