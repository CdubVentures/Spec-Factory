import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRuntimeOpsWorkers,
  buildWorkerDetail
} from '../runtimeOpsDataBuilders.js';
import {
  emitSearchAttempt,
  findWorker,
  makeBridge,
  startRun,
  workersByPool
} from './fixtures/runtimeOpsWorkerPipelineHarness.js';

test('integration: sequential queries keep one visible worker per query', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  const queries = [
    'razer viper specs',
    'logitech g pro specs',
    'zowie ec2 specs',
    'steelseries prime specs',
    'finalmouse starlight specs',
    'endgame haste specs'
  ];

  for (let i = 0; i < queries.length; i += 1) {
    await emitSearchAttempt(bridge, {
      startTs: `2025-01-01T00:00:${10 + i * 10}Z`,
      finishTs: `2025-01-01T00:00:${15 + i * 10}Z`,
      query: queries[i],
      resultCount: 8,
      durationMs: 400,
    });
  }

  const workers = buildRuntimeOpsWorkers(events);
  const searchWorkers = workersByPool(workers, 'search');

  assert.equal(searchWorkers.length, queries.length, 'one visible worker row per sequential query');
  assert.deepEqual(searchWorkers.map((worker) => worker.worker_id), [
    'search-a',
    'search-b',
    'search-c',
    'search-d',
    'search-e',
    'search-f',
  ]);
  assert.deepEqual(searchWorkers.map((worker) => worker.slot), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.ok(searchWorkers.every((worker) => worker.tasks_started === 1), 'each search slot handles one query');
  assert.ok(searchWorkers.every((worker) => worker.tasks_completed === 1), 'each search slot records one completion');
});

test('integration: search worker detail reflects the query owned by that slot', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  const queries = ['query one', 'query two', 'query three'];
  for (let i = 0; i < queries.length; i += 1) {
    await emitSearchAttempt(bridge, {
      startTs: `2025-01-01T00:00:${10 + i * 10}Z`,
      finishTs: `2025-01-01T00:00:${15 + i * 10}Z`,
      query: queries[i],
      resultCount: 5 + i,
      durationMs: 300 + i * 100,
    });
  }

  const detail = buildWorkerDetail(events, 'search-c');

  assert.ok(Array.isArray(detail.search_history), 'has search_history array');
  assert.equal(detail.search_history.length, 1, 'each bridge-owned worker keeps its own single query history');
  assert.equal(detail.search_history[0].query, 'query three');
  assert.equal(detail.search_history[0].provider, 'google');
  assert.equal(detail.search_history[0].result_count, 7);
  assert.equal(detail.search_history[0].duration_ms, 500);
  assert.equal(detail.search_history[0].status, 'done');
  assert.deepEqual(detail.documents, [], 'documents empty for search');
});

test('integration: search KPI rows preserve totals across per-query workers', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  const queries = [
    { q: 'query one', results: 10, ms: 400 },
    { q: 'query two', results: 0, ms: 300 },
    { q: 'query three', results: 8, ms: 500 },
    { q: 'query four', results: 12, ms: 600 }
  ];

  for (let i = 0; i < queries.length; i += 1) {
    await emitSearchAttempt(bridge, {
      startTs: `2025-01-01T00:00:${10 + i * 10}Z`,
      finishTs: `2025-01-01T00:00:${15 + i * 10}Z`,
      query: queries[i].q,
      resultCount: queries[i].results,
      durationMs: queries[i].ms,
    });
  }

  const workers = buildRuntimeOpsWorkers(events);
  const searchWorkers = workersByPool(workers, 'search');

  assert.equal(searchWorkers.length, queries.length, 'one worker row per completed query');
  assert.equal(
    searchWorkers.reduce((sum, worker) => sum + worker.tasks_completed, 0),
    4,
    'all completions are preserved across workers',
  );
  assert.equal(
    searchWorkers.reduce((sum, worker) => sum + worker.zero_result_count, 0),
    1,
    'zero-result queries are preserved across workers',
  );
  assert.equal(
    searchWorkers.reduce((sum, worker) => sum + worker.last_result_count, 0),
    30,
    'result counts are preserved per worker row',
  );
  assert.equal(
    searchWorkers.reduce((sum, worker) => sum + worker.last_duration_ms, 0),
    1800,
    'durations are preserved per worker row',
  );
  assert.equal(findWorker(searchWorkers, 'search-b')?.last_result_count, 0, 'zero-result worker is retained');
});
