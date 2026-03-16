import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlannerQueueSnapshotPhase } from '../src/features/indexing/orchestration/index.js';

test('runPlannerQueueSnapshotPhase writes planner trace snapshot and emits queue snapshot telemetry', async () => {
  const traceCalls = [];
  const logs = [];
  const blockedHosts = Array.from({ length: 20 }, (_, index) => `host-${index}`);

  await runPlannerQueueSnapshotPhase({
    traceWriter: {
      async writeJson(payload) {
        traceCalls.push(payload);
        return { trace_path: 'trace/planner/queue_snapshot.json' };
      },
    },
    planner: {
      manufacturerQueue: ['m1', 'm2'],
      queue: ['q1'],
      candidateQueue: ['c1', 'c2', 'c3'],
      blockedHosts: new Set(blockedHosts),
      getStats() {
        return { queued: 6 };
      },
    },
    logger: {
      info(eventName, payload) {
        logs.push({ eventName, payload });
      },
    },
    nowIsoFn: () => '2026-03-06T12:00:00.000Z',
  });

  assert.equal(traceCalls.length, 1);
  assert.deepEqual(traceCalls[0], {
    section: 'planner',
    prefix: 'queue_snapshot',
    payload: {
      ts: '2026-03-06T12:00:00.000Z',
      pending_count: 6,
      blocked_hosts: blockedHosts.slice(0, 60),
      stats: { queued: 6 },
    },
    ringSize: 20,
  });
  assert.deepEqual(logs, [{
    eventName: 'planner_queue_snapshot_written',
    payload: {
      pending_count: 6,
      blocked_hosts: blockedHosts.slice(0, 12),
      trace_path: 'trace/planner/queue_snapshot.json',
    },
  }]);
});

test('runPlannerQueueSnapshotPhase is a no-op when trace writer is unavailable', async () => {
  let logged = false;
  await runPlannerQueueSnapshotPhase({
    traceWriter: null,
    planner: {
      getStats() {
        return {};
      },
    },
    logger: {
      info() {
        logged = true;
      },
    },
  });

  assert.equal(logged, false);
});
