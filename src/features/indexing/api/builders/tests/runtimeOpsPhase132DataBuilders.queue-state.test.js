import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQueueState,
  makeEvent,
} from './helpers/runtimeOpsPhase132DataBuildersHarness.js';

test('buildQueueState: returns empty structure for no events', () => {
  const result = buildQueueState([], {});
  assert.ok(result && typeof result === 'object');
  assert.ok(Array.isArray(result.jobs));
  assert.ok(Array.isArray(result.lane_summary));
  assert.ok(Array.isArray(result.blocked_hosts));
  assert.equal(result.jobs.length, 0);
});

test('buildQueueState: aggregates repair_query_enqueued events into job rows', () => {
  const events = [
    makeEvent('repair_query_enqueued', {
      dedupe_key: 'repair-1',
      url: 'https://a.com/page',
      query: 'razer viper specs',
      reason: '404 not found',
      field_targets: ['weight', 'sensor'],
      lane: 'repair_search',
    }),
  ];
  const result = buildQueueState(events, {});
  assert.ok(result.jobs.length >= 1);
  const job = result.jobs[0];
  assert.equal(job.id, 'repair-1');
  assert.equal(job.lane, 'repair_search');
  assert.equal(job.status, 'queued');
  assert.equal(job.url, 'https://a.com/page');
  assert.equal(job.query, 'razer viper specs');
  assert.equal(job.reason, '404 not found');
  assert.ok(Array.isArray(job.field_targets));
  assert.equal(job.field_targets.length, 2);
});

test('buildQueueState: tracks job status from url_cooldown_applied events', () => {
  const events = [
    makeEvent('repair_query_enqueued', {
      dedupe_key: 'repair-1',
      url: 'https://a.com/page',
      lane: 'repair_search',
      reason: '404',
    }, '2026-02-23T12:00:00.000Z'),
    makeEvent('url_cooldown_applied', {
      dedupe_key: 'repair-1',
      url: 'https://a.com/page',
      status: 'cooldown',
      cooldown_until: '2026-02-23T12:30:00.000Z',
      reason: '403 cooldown',
    }, '2026-02-23T12:01:00.000Z'),
  ];
  const result = buildQueueState(events, {});
  const job = result.jobs.find((j) => j.id === 'repair-1');
  assert.ok(job);
  assert.equal(job.status, 'cooldown');
  assert.equal(job.cooldown_until, '2026-02-23T12:30:00.000Z');
});

test('buildQueueState: tracks blocked_domain_cooldown_applied as blocked hosts', () => {
  const events = [
    makeEvent('blocked_domain_cooldown_applied', {
      host: 'blocked.com',
      blocked_count: 5,
      threshold: 2,
      removed_count: 3,
    }),
  ];
  const result = buildQueueState(events, {});
  assert.ok(result.blocked_hosts.length >= 1);
  const entry = result.blocked_hosts.find((b) => b.host === 'blocked.com');
  assert.ok(entry);
  assert.equal(entry.blocked_count, 5);
  assert.equal(entry.threshold, 2);
  assert.equal(entry.removed_count, 3);
});

test('buildQueueState: groups jobs by lane in lane_summary', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: '404' }),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r2', url: 'https://b.com/2', lane: 'repair_search', reason: '410' }),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r3', url: 'https://c.com/3', lane: 'refetch', reason: 'stale' }),
  ];
  const result = buildQueueState(events, {});
  assert.ok(result.lane_summary.length >= 2);
  const repairLane = result.lane_summary.find((l) => l.lane === 'repair_search');
  assert.ok(repairLane);
  assert.equal(repairLane.queued, 2);
  const refetchLane = result.lane_summary.find((l) => l.lane === 'refetch');
  assert.ok(refetchLane);
  assert.equal(refetchLane.queued, 1);
});

test('buildQueueState: computes lane counts with mixed statuses', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: '404' }, '2026-02-23T12:00:00.000Z'),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r2', url: 'https://b.com/2', lane: 'repair_search', reason: '410' }, '2026-02-23T12:00:01.000Z'),
    makeEvent('url_cooldown_applied', { dedupe_key: 'r1', status: 'done', reason: 'repaired' }, '2026-02-23T12:01:00.000Z'),
    makeEvent('url_cooldown_applied', { dedupe_key: 'r2', status: 'failed', reason: 'still 404' }, '2026-02-23T12:01:01.000Z'),
  ];
  const result = buildQueueState(events, {});
  const repairLane = result.lane_summary.find((l) => l.lane === 'repair_search');
  assert.ok(repairLane);
  assert.equal(repairLane.done, 1);
  assert.equal(repairLane.failed, 1);
});

test('buildQueueState: includes transition history per job', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: '404' }, '2026-02-23T12:00:00.000Z'),
    makeEvent('url_cooldown_applied', { dedupe_key: 'r1', status: 'running', reason: 'started' }, '2026-02-23T12:01:00.000Z'),
    makeEvent('url_cooldown_applied', { dedupe_key: 'r1', status: 'done', reason: 'completed' }, '2026-02-23T12:02:00.000Z'),
  ];
  const result = buildQueueState(events, {});
  const job = result.jobs.find((j) => j.id === 'r1');
  assert.ok(job);
  assert.ok(Array.isArray(job.transitions));
  assert.equal(job.transitions.length, 2);
  assert.equal(job.transitions[0].to_status, 'running');
  assert.equal(job.transitions[1].to_status, 'done');
});

test('buildQueueState: respects limit option', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: '1' }),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r2', url: 'https://b.com/2', lane: 'repair_search', reason: '2' }),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r3', url: 'https://c.com/3', lane: 'repair_search', reason: '3' }),
  ];
  const result = buildQueueState(events, { limit: 2 });
  assert.ok(result.jobs.length <= 2);
});

test('buildQueueState: handles duplicate dedupe_keys with latest event winning', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: 'first' }, '2026-02-23T12:00:00.000Z'),
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://a.com/1', lane: 'repair_search', reason: 'second' }, '2026-02-23T12:01:00.000Z'),
  ];
  const result = buildQueueState(events, {});
  const jobs = result.jobs.filter((j) => j.id === 'r1');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].reason, 'second');
});

test('buildQueueState: extracts host from URL', () => {
  const events = [
    makeEvent('repair_query_enqueued', { dedupe_key: 'r1', url: 'https://example.com/page/1', lane: 'refetch', reason: 'stale' }),
  ];
  const result = buildQueueState(events, {});
  const job = result.jobs.find((j) => j.id === 'r1');
  assert.ok(job);
  assert.equal(job.host, 'example.com');
});
