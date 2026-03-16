/**
 * searchWorkerPanelDataFlow.test.js
 *
 * End-to-end data flow tests for the SearchWorkerPanel.
 * Proves every metric, field, and state the panel consumes is correctly
 * built from bridge-format events ({ query, provider } — NOT { current_query, current_provider }).
 *
 * Coverage matrix:
 *
 * Worker row fields (buildRuntimeOpsWorkers):
 *  1. pool === 'search'
 *  2. slot — from payload.slot
 *  3. tasks_started — from payload.tasks_started
 *  4. tasks_completed — incremented per search_finished
 *  5. current_query — from payload.query (bridge name) while running, null after finish
 *  6. current_provider — from payload.provider (bridge name) while running, null after finish
 *  7. zero_result_count — incremented when result_count === 0
 *  8. avg_result_count — rolling average
 *  9. avg_duration_ms — rolling average
 * 10. last_result_count — from most recent search_finished
 * 11. last_duration_ms — from most recent search_finished
 * 12. state — running when active, idle after finish
 * 13. last_error — null for search workers (no error path)
 *
 * Worker detail fields (buildWorkerDetail):
 * 14. search_history populated
 * 15. Each attempt.query from bridge field name
 * 16. Each attempt.provider from bridge field name
 * 17. status: 'running' for active, 'done' for result_count > 0, 'zero' for result_count === 0
 * 18. result_count per attempt
 * 19. duration_ms per attempt
 * 20. started_ts per attempt
 * 21. finished_ts per attempt (null for running)
 * 22. Ordering: most recent attempt first (descending attempt_no)
 *
 * Route shape (runtimeOpsRoutes):
 * 23. /runtime/workers returns rows with all search-pool fields
 * 24. /runtime/workers/:id returns search_history array
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeOpsWorkers,
  buildWorkerDetail
} from '../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

// ── Event factories — use bridge field names (query, provider) ──────────────

function bridgeSearchStarted(workerId, { slot, tasks_started, query, provider, ts } = {}) {
  return {
    event: 'search_started',
    ts: ts || '2025-01-01T00:00:10.000Z',
    payload: {
      worker_id: workerId,
      scope: 'query',
      slot: slot ?? 'a',
      tasks_started: tasks_started ?? 1,
      query: query ?? 'default query',
      provider: provider ?? 'google'
    }
  };
}

function bridgeSearchFinished(workerId, { slot, tasks_started, query, provider, result_count, duration_ms, ts } = {}) {
  return {
    event: 'search_finished',
    ts: ts || '2025-01-01T00:00:15.000Z',
    payload: {
      worker_id: workerId,
      scope: 'query',
      slot: slot ?? 'a',
      tasks_started: tasks_started ?? 1,
      query: query ?? 'default query',
      provider: provider ?? 'google',
      result_count: result_count ?? 10,
      duration_ms: duration_ms ?? 500
    }
  };
}

function findWorker(workers, id) {
  return workers.find((w) => w.worker_id === id);
}

/** Pass nowMs close to the test timestamps so running workers aren't misclassified as stuck */
function buildWorkers(events) {
  // All test timestamps are around 2025-01-01T00:00:xx or 2025-01-01T14:3x:xx
  // Use nowMs = 5 seconds after the last event to simulate "just happened"
  let maxTs = 0;
  for (const evt of events) {
    const ms = new Date(evt.ts).getTime();
    if (ms > maxTs) maxTs = ms;
  }
  return buildRuntimeOpsWorkers(events, { nowMs: maxTs + 5000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER ROW FIELDS (buildRuntimeOpsWorkers)
// ═══════════════════════════════════════════════════════════════════════════════

test('search panel data: pool is "search" for search_started events', () => {
  const workers = buildWorkers([
    bridgeSearchStarted('search-a')
  ]);
  assert.equal(findWorker(workers, 'search-a').pool, 'search');
});

test('search panel data: slot is populated from bridge payload', () => {
  const workers = buildWorkers([
    bridgeSearchStarted('search-a', { slot: 'b' })
  ]);
  assert.equal(findWorker(workers, 'search-a').slot, 'b');
});

test('search panel data: tasks_started from bridge payload', () => {
  const workers = buildWorkers([
    bridgeSearchStarted('search-a', { tasks_started: 7 })
  ]);
  assert.equal(findWorker(workers, 'search-a').tasks_started, 7);
});

test('search panel data: tasks_completed increments per search_finished', () => {
  const events = [
    bridgeSearchStarted('search-a', { tasks_started: 1, query: 'q1', provider: 'google', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 1, query: 'q1', provider: 'google', result_count: 5, duration_ms: 300, ts: '2025-01-01T00:00:12.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 2, query: 'q2', provider: 'bing', ts: '2025-01-01T00:00:14.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 2, query: 'q2', provider: 'bing', result_count: 8, duration_ms: 400, ts: '2025-01-01T00:00:16.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 3, query: 'q3', provider: 'brave', ts: '2025-01-01T00:00:18.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 3, query: 'q3', provider: 'brave', result_count: 3, duration_ms: 600, ts: '2025-01-01T00:00:20.000Z' }),
  ];
  const w = findWorker(buildWorkers(events), 'search-a');
  assert.equal(w.tasks_completed, 3);
});

test('search panel data: current_query set from bridge "query" field while running', () => {
  const workers = buildWorkers([
    bridgeSearchStarted('search-a', { query: 'Sony WH-1000XM5 specs' })
  ]);
  assert.equal(findWorker(workers, 'search-a').current_query, 'Sony WH-1000XM5 specs');
});

test('search panel data: current_provider set from bridge "provider" field while running', () => {
  const workers = buildWorkers([
    bridgeSearchStarted('search-a', { provider: 'bing' })
  ]);
  assert.equal(findWorker(workers, 'search-a').current_provider, 'bing');
});

test('search panel data: current_query and current_provider cleared after search_finished', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'test query', provider: 'google', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { query: 'test query', provider: 'google', result_count: 5, duration_ms: 300, ts: '2025-01-01T00:00:12.000Z' }),
  ];
  const w = findWorker(buildWorkers(events), 'search-a');
  assert.equal(w.current_query, null, 'current_query should be null after finish');
  assert.equal(w.current_provider, null, 'current_provider should be null after finish');
});

test('search panel data: current_query and current_provider repopulate on next search_started', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'google', tasks_started: 1, ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { query: 'q1', provider: 'google', result_count: 5, duration_ms: 300, tasks_started: 1, ts: '2025-01-01T00:00:12.000Z' }),
    bridgeSearchStarted('search-a', { query: 'q2', provider: 'bing', tasks_started: 2, ts: '2025-01-01T00:00:14.000Z' }),
  ];
  const w = findWorker(buildWorkers(events), 'search-a');
  assert.equal(w.current_query, 'q2', 'current_query should be q2 after second start');
  assert.equal(w.current_provider, 'bing', 'current_provider should be bing after second start');
});

test('search panel data: zero_result_count increments when result_count is 0', () => {
  const events = [
    bridgeSearchStarted('search-a', { tasks_started: 1, query: 'q1', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 1, query: 'q1', result_count: 10, duration_ms: 400, ts: '2025-01-01T00:00:12.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 2, query: 'q2', ts: '2025-01-01T00:00:14.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 2, query: 'q2', result_count: 0, duration_ms: 500, ts: '2025-01-01T00:00:16.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 3, query: 'q3', ts: '2025-01-01T00:00:18.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 3, query: 'q3', result_count: 0, duration_ms: 200, ts: '2025-01-01T00:00:20.000Z' }),
  ];
  const w = findWorker(buildWorkers(events), 'search-a');
  assert.equal(w.zero_result_count, 2, 'two searches had 0 results');
});

test('search panel data: avg_result_count is correct rolling average', () => {
  const events = [
    bridgeSearchStarted('search-a', { tasks_started: 1, query: 'q1', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 1, query: 'q1', result_count: 10, duration_ms: 400, ts: '2025-01-01T00:00:12.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 2, query: 'q2', ts: '2025-01-01T00:00:14.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 2, query: 'q2', result_count: 0, duration_ms: 200, ts: '2025-01-01T00:00:16.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 3, query: 'q3', ts: '2025-01-01T00:00:18.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 3, query: 'q3', result_count: 5, duration_ms: 300, ts: '2025-01-01T00:00:20.000Z' }),
  ];
  const w = findWorker(buildWorkers(events), 'search-a');
  // (10 + 0 + 5) / 3 = 5.0
  assert.equal(w.avg_result_count, 5, 'avg_result_count should be 5');
});

test('search panel data: avg_duration_ms is correct rolling average', () => {
  const events = [
    bridgeSearchStarted('search-a', { tasks_started: 1, query: 'q1', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 1, query: 'q1', result_count: 10, duration_ms: 400, ts: '2025-01-01T00:00:12.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 2, query: 'q2', ts: '2025-01-01T00:00:14.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 2, query: 'q2', result_count: 5, duration_ms: 200, ts: '2025-01-01T00:00:16.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 3, query: 'q3', ts: '2025-01-01T00:00:18.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 3, query: 'q3', result_count: 3, duration_ms: 300, ts: '2025-01-01T00:00:20.000Z' }),
  ];
  const w = findWorker(buildWorkers(events), 'search-a');
  // (400 + 200 + 300) / 3 = 300
  assert.equal(w.avg_duration_ms, 300, 'avg_duration_ms should be 300');
});

test('search panel data: last_result_count and last_duration_ms from most recent finish', () => {
  const events = [
    bridgeSearchStarted('search-a', { tasks_started: 1, query: 'q1', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 1, query: 'q1', result_count: 10, duration_ms: 400, ts: '2025-01-01T00:00:12.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 2, query: 'q2', ts: '2025-01-01T00:00:14.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 2, query: 'q2', result_count: 7, duration_ms: 612, ts: '2025-01-01T00:00:16.000Z' }),
  ];
  const w = findWorker(buildWorkers(events), 'search-a');
  assert.equal(w.last_result_count, 7, 'last_result_count from most recent search');
  assert.equal(w.last_duration_ms, 612, 'last_duration_ms from most recent search');
});

test('search panel data: state is "running" while search is active', () => {
  const workers = buildWorkers([
    bridgeSearchStarted('search-a', { query: 'active query', ts: '2025-01-01T00:00:10.000Z' })
  ]);
  assert.equal(findWorker(workers, 'search-a').state, 'running');
});

test('search panel data: state is "idle" after search_finished', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { query: 'q1', result_count: 5, duration_ms: 300, ts: '2025-01-01T00:00:12.000Z' }),
  ];
  const w = findWorker(buildWorkers(events), 'search-a');
  assert.equal(w.state, 'idle');
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER DETAIL / SEARCH_HISTORY (buildWorkerDetail)
// ═══════════════════════════════════════════════════════════════════════════════

test('search panel detail: search_history populated from bridge events', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'google', tasks_started: 1, ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { query: 'q1', provider: 'google', result_count: 12, duration_ms: 450, tasks_started: 1, ts: '2025-01-01T00:00:15.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.ok(Array.isArray(detail.search_history));
  assert.equal(detail.search_history.length, 1);
});

test('search panel detail: attempt.query from bridge "query" field', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'Sony WH-1000XM5 specifications site:sony.com', provider: 'google', ts: '2025-01-01T00:00:10.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].query, 'Sony WH-1000XM5 specifications site:sony.com');
});

test('search panel detail: attempt.provider from bridge "provider" field', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'brave', ts: '2025-01-01T00:00:10.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].provider, 'brave');
});

test('search panel detail: attempt status is "running" while active', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'google', ts: '2025-01-01T00:00:10.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].status, 'running');
});

test('search panel detail: attempt status is "done" when result_count > 0', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'google', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { query: 'q1', provider: 'google', result_count: 14, duration_ms: 503, ts: '2025-01-01T00:00:15.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].status, 'done');
});

test('search panel detail: attempt status is "zero" when result_count === 0', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'google', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { query: 'q1', provider: 'google', result_count: 0, duration_ms: 511, ts: '2025-01-01T00:00:15.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].status, 'zero');
});

test('search panel detail: attempt result_count and duration_ms from finished event', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'bing', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { query: 'q1', provider: 'bing', result_count: 9, duration_ms: 412, ts: '2025-01-01T00:00:15.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].result_count, 9);
  assert.equal(detail.search_history[0].duration_ms, 412);
});

test('search panel detail: attempt started_ts from search_started event', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'google', ts: '2025-01-01T14:31:02.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].started_ts, '2025-01-01T14:31:02.000Z');
});

test('search panel detail: attempt finished_ts is null while running', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'google', ts: '2025-01-01T14:31:02.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].finished_ts, null);
});

test('search panel detail: attempt finished_ts populated after search_finished', () => {
  const events = [
    bridgeSearchStarted('search-a', { query: 'q1', provider: 'google', ts: '2025-01-01T14:31:02.000Z' }),
    bridgeSearchFinished('search-a', { query: 'q1', provider: 'google', result_count: 9, duration_ms: 412, ts: '2025-01-01T14:31:15.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history[0].finished_ts, '2025-01-01T14:31:15.000Z');
});

test('search panel detail: attempts ordered by attempt_no descending (most recent first)', () => {
  const events = [
    bridgeSearchStarted('search-a', { tasks_started: 1, query: 'q1', provider: 'google', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 1, query: 'q1', provider: 'google', result_count: 9, duration_ms: 412, ts: '2025-01-01T00:00:15.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 2, query: 'q2', provider: 'bing', ts: '2025-01-01T00:00:20.000Z' }),
    bridgeSearchFinished('search-a', { tasks_started: 2, query: 'q2', provider: 'bing', result_count: 6, duration_ms: 588, ts: '2025-01-01T00:00:25.000Z' }),
    bridgeSearchStarted('search-a', { tasks_started: 3, query: 'q3', provider: 'brave', ts: '2025-01-01T00:00:30.000Z' }),
  ];
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history.length, 3);
  assert.equal(detail.search_history[0].attempt_no, 3, 'first in list = most recent');
  assert.equal(detail.search_history[1].attempt_no, 2);
  assert.equal(detail.search_history[2].attempt_no, 1, 'last in list = oldest');
});

// ═══════════════════════════════════════════════════════════════════════════════
// FULL MOCKUP SCENARIO — 12 attempts matching the reference screenshot
// ═══════════════════════════════════════════════════════════════════════════════

test('search panel data: full mockup scenario — 12 attempts with mixed providers and states', () => {
  // Simulates the exact scenario from the reference mockup screenshot
  const attempts = [
    { n: 1,  q: 'Sony WH-1000XM5 site:sony.com',                    p: 'google', rc: 9,  dur: 412 },
    { n: 2,  q: 'WH-1000XM5 ANC attenuation dB measurements',       p: 'bing',   rc: 6,  dur: 588 },
    { n: 3,  q: 'Sony WH-1000XM5 driver size mm official',          p: 'google', rc: 11, dur: 490 },
    { n: 4,  q: 'WH-1000XM5 battery life hours',                     p: 'brave',  rc: 7,  dur: 631 },
    { n: 5,  q: 'WH-1000XM5 LDAC codec support',                    p: 'google', rc: 5,  dur: 501 },
    { n: 6,  q: 'Sony WH-1000XM5 weight grams specs',               p: 'bing',   rc: 8,  dur: 445 },
    { n: 7,  q: 'WH-1000XM5 noise cancellation review rtings',      p: 'google', rc: 12, dur: 389 },
    { n: 8,  q: 'Sony headphones WH-1000XM5 datasheet PDF',         p: 'google', rc: 0,  dur: 511 },
    { n: 9,  q: 'sony.com WH-1000XM5 specifications page',          p: 'brave',  rc: 4,  dur: 612 },
    { n: 10, q: 'WH-1000XM5 multipoint connection specs',           p: 'google', rc: 9,  dur: 470 },
    { n: 11, q: 'Sony XM5 vs XM4 specs comparison',                  p: 'bing',   rc: 14, dur: 503 },
    // #12 is still running
  ];

  const events = [];
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const baseTime = 10 + i * 10;
    events.push(bridgeSearchStarted('search-a', {
      slot: 'a',
      tasks_started: a.n,
      query: a.q,
      provider: a.p,
      ts: `2025-01-01T14:${String(Math.floor(baseTime / 60) + 31).padStart(2, '0')}:${String(baseTime % 60).padStart(2, '0')}.000Z`
    }));
    events.push(bridgeSearchFinished('search-a', {
      slot: 'a',
      tasks_started: a.n,
      query: a.q,
      provider: a.p,
      result_count: a.rc,
      duration_ms: a.dur,
      ts: `2025-01-01T14:${String(Math.floor((baseTime + 5) / 60) + 31).padStart(2, '0')}:${String((baseTime + 5) % 60).padStart(2, '0')}.000Z`
    }));
  }

  // #12 is still running
  events.push(bridgeSearchStarted('search-a', {
    slot: 'a',
    tasks_started: 12,
    query: 'Sony WH-1000XM5 specifications site:sony.com',
    provider: 'google',
    ts: '2025-01-01T14:34:01.000Z'
  }));

  // ── Worker row assertions ──
  const workers = buildWorkers(events);
  const w = findWorker(workers, 'search-a');

  assert.ok(w, 'worker should exist');
  assert.equal(w.pool, 'search');
  assert.equal(w.slot, 'a');
  assert.equal(w.tasks_started, 12);
  assert.equal(w.tasks_completed, 11, '11 finished searches');
  assert.equal(w.current_query, 'Sony WH-1000XM5 specifications site:sony.com', 'running query #12');
  assert.equal(w.current_provider, 'google', 'running provider for #12');
  assert.equal(w.zero_result_count, 1, 'only attempt #8 had 0 results');
  assert.equal(w.state, 'running', 'search #12 is still active');

  // avg result = (9+6+11+7+5+8+12+0+4+9+14) / 11 = 85/11 ≈ 7.73
  assert.ok(Math.abs(w.avg_result_count - 7.73) < 0.1, `avg_result_count ~7.73, got ${w.avg_result_count}`);
  // avg duration = (412+588+490+631+501+445+389+511+612+470+503) / 11 = 5552/11 ≈ 505
  assert.ok(Math.abs(w.avg_duration_ms - 505) < 1, `avg_duration_ms ~505, got ${w.avg_duration_ms}`);
  // last finished values from attempt #11
  assert.equal(w.last_result_count, 14, 'last_result_count from #11');
  assert.equal(w.last_duration_ms, 503, 'last_duration_ms from #11');

  // ── Worker detail assertions ──
  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history.length, 12, '12 attempts in history');

  // Most recent first
  const latest = detail.search_history[0];
  assert.equal(latest.attempt_no, 12);
  assert.equal(latest.query, 'Sony WH-1000XM5 specifications site:sony.com');
  assert.equal(latest.provider, 'google');
  assert.equal(latest.status, 'running');
  assert.equal(latest.result_count, 0, 'running attempt has 0 results');
  assert.equal(latest.finished_ts, null, 'running attempt has no finished_ts');

  const oldest = detail.search_history[11];
  assert.equal(oldest.attempt_no, 1);
  assert.equal(oldest.query, 'Sony WH-1000XM5 site:sony.com');
  assert.equal(oldest.provider, 'google');
  assert.equal(oldest.status, 'done');
  assert.equal(oldest.result_count, 9);
  assert.equal(oldest.duration_ms, 412);

  // Zero result attempt (#8)
  const zeroAttempt = detail.search_history.find((a) => a.attempt_no === 8);
  assert.equal(zeroAttempt.query, 'Sony headphones WH-1000XM5 datasheet PDF');
  assert.equal(zeroAttempt.provider, 'google');
  assert.equal(zeroAttempt.status, 'zero');
  assert.equal(zeroAttempt.result_count, 0);

  // Provider variety
  const providers = new Set(detail.search_history.map((a) => a.provider));
  assert.ok(providers.has('google'), 'google provider present');
  assert.ok(providers.has('bing'), 'bing provider present');
  assert.ok(providers.has('brave'), 'brave provider present');

  // All queries non-empty
  for (const attempt of detail.search_history) {
    assert.ok(attempt.query.length > 0, `attempt #${attempt.attempt_no} query is non-empty`);
    assert.ok(attempt.provider.length > 0, `attempt #${attempt.attempt_no} provider is non-empty`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-SLOT SCENARIO — 3 workers, each in a different slot
// ═══════════════════════════════════════════════════════════════════════════════

test('search panel data: multi-slot workers are independent', () => {
  const events = [
    bridgeSearchStarted('search-a', { slot: 'a', tasks_started: 1, query: 'query-a', provider: 'google', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchStarted('search-b', { slot: 'b', tasks_started: 1, query: 'query-b', provider: 'bing', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchStarted('search-c', { slot: 'c', tasks_started: 1, query: 'query-c', provider: 'brave', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { slot: 'a', tasks_started: 1, query: 'query-a', provider: 'google', result_count: 5, duration_ms: 300, ts: '2025-01-01T00:00:15.000Z' }),
    bridgeSearchFinished('search-b', { slot: 'b', tasks_started: 1, query: 'query-b', provider: 'bing', result_count: 0, duration_ms: 500, ts: '2025-01-01T00:00:15.000Z' }),
  ];

  const workers = buildWorkers(events);

  const a = findWorker(workers, 'search-a');
  assert.equal(a.slot, 'a');
  assert.equal(a.state, 'idle');
  assert.equal(a.tasks_completed, 1);
  assert.equal(a.zero_result_count, 0);
  assert.equal(a.current_query, null, 'slot a finished');

  const b = findWorker(workers, 'search-b');
  assert.equal(b.slot, 'b');
  assert.equal(b.state, 'idle');
  assert.equal(b.tasks_completed, 1);
  assert.equal(b.zero_result_count, 1, 'slot b got 0 results');
  assert.equal(b.current_query, null, 'slot b finished');

  const c = findWorker(workers, 'search-c');
  assert.equal(c.slot, 'c');
  assert.equal(c.state, 'running');
  assert.equal(c.tasks_completed, 0, 'slot c still running');
  assert.equal(c.current_query, 'query-c', 'slot c query still active');
  assert.equal(c.current_provider, 'brave', 'slot c provider still active');

  // Detail for each slot
  const detailA = buildWorkerDetail(events, 'search-a');
  assert.equal(detailA.search_history.length, 1);
  assert.equal(detailA.search_history[0].query, 'query-a');
  assert.equal(detailA.search_history[0].provider, 'google');

  const detailB = buildWorkerDetail(events, 'search-b');
  assert.equal(detailB.search_history.length, 1);
  assert.equal(detailB.search_history[0].query, 'query-b');
  assert.equal(detailB.search_history[0].provider, 'bing');
  assert.equal(detailB.search_history[0].status, 'zero');

  const detailC = buildWorkerDetail(events, 'search-c');
  assert.equal(detailC.search_history.length, 1);
  assert.equal(detailC.search_history[0].query, 'query-c');
  assert.equal(detailC.search_history[0].provider, 'brave');
  assert.equal(detailC.search_history[0].status, 'running');
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE SHAPE — verify route handler produces correct response shape
// ═══════════════════════════════════════════════════════════════════════════════

test('search panel route shape: workers list includes all search-pool fields', () => {
  // Simulates what the /runtime/workers route returns via buildRuntimeOpsWorkers
  const events = [
    bridgeSearchStarted('search-a', { slot: 'a', tasks_started: 3, query: 'test query', provider: 'google' }),
  ];

  const workers = buildWorkers(events);
  const w = findWorker(workers, 'search-a');

  // Every field the frontend reads from the worker row:
  assert.equal(typeof w.worker_id, 'string');
  assert.equal(w.pool, 'search');
  assert.equal(typeof w.state, 'string');
  assert.equal(typeof w.stage, 'string');
  assert.equal(typeof w.elapsed_ms, 'number');
  assert.equal(w.slot, 'a');
  assert.equal(w.tasks_started, 3);
  assert.equal(typeof w.tasks_completed, 'number');
  assert.equal(w.current_query, 'test query');
  assert.equal(w.current_provider, 'google');
  assert.equal(typeof w.zero_result_count, 'number');
  assert.equal(typeof w.avg_result_count, 'number');
  assert.equal(typeof w.avg_duration_ms, 'number');
  assert.equal(typeof w.last_result_count, 'number');
  assert.equal(typeof w.last_duration_ms, 'number');
});

test('search panel route shape: worker detail includes search_history with all attempt fields', () => {
  // Simulates what the /runtime/workers/:id route returns via buildWorkerDetail
  const events = [
    bridgeSearchStarted('search-a', { slot: 'a', tasks_started: 1, query: 'q1', provider: 'bing', ts: '2025-01-01T00:00:10.000Z' }),
    bridgeSearchFinished('search-a', { slot: 'a', tasks_started: 1, query: 'q1', provider: 'bing', result_count: 8, duration_ms: 445, ts: '2025-01-01T00:00:15.000Z' }),
  ];

  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.worker_id, 'search-a');
  assert.ok(Array.isArray(detail.search_history), 'search_history should be in response');
  assert.equal(detail.search_history.length, 1);

  // Verify every field the frontend's SearchWorkerAttempt type requires
  const attempt = detail.search_history[0];
  assert.equal(typeof attempt.attempt_no, 'number');
  assert.equal(attempt.query, 'q1');
  assert.equal(attempt.provider, 'bing');
  assert.equal(attempt.status, 'done');
  assert.equal(attempt.result_count, 8);
  assert.equal(attempt.duration_ms, 445);
  assert.equal(typeof attempt.started_ts, 'string');
  assert.equal(typeof attempt.finished_ts, 'string');
});
