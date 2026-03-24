import test from 'node:test';
import assert from 'node:assert/strict';

import { createAutomationQueueBuilder } from '../automationQueueBuilder.js';

function makeBuilder(overrides = {}) {
  return createAutomationQueueBuilder({
    resolveContext: async () => ({
      token: 'run-abc',
      resolvedRunId: 'run-abc',
      category: 'mouse',
      productId: 'mouse-test-brand-model',
      meta: { started_at: '2026-01-01T00:00:00Z' },
    }),
    readEvents: async () => [],
    readNeedSet: async () => null,
    readSearchProfile: async () => null,
    ...overrides,
  });
}

// --- Factory ---

test('createAutomationQueueBuilder returns object with expected function', () => {
  const builder = makeBuilder();
  assert.equal(typeof builder.readIndexLabRunAutomationQueue, 'function');
});

// --- Guards ---

test('null context returns null', async () => {
  const builder = makeBuilder({ resolveContext: async () => null });
  const result = await builder.readIndexLabRunAutomationQueue('run-missing');
  assert.equal(result, null);
});

test('empty events produce valid structure with zero jobs', async () => {
  const builder = makeBuilder();
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  assert.ok(result);
  assert.equal(result.run_id, 'run-abc');
  assert.equal(result.category, 'mouse');
  assert.equal(result.product_id, 'mouse-test-brand-model');
  assert.deepEqual(result.jobs, []);
  assert.deepEqual(result.actions, []);
  assert.equal(result.summary.total_jobs, 0);
});

// --- Output shape ---

test('return has all required top-level keys', async () => {
  const builder = makeBuilder();
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const keys = Object.keys(result);
  for (const expected of ['generated_at', 'run_id', 'category', 'product_id', 'summary', 'policies', 'jobs', 'actions']) {
    assert.ok(keys.includes(expected), `missing key: ${expected}`);
  }
  assert.equal(typeof result.summary.total_jobs, 'number');
  assert.equal(typeof result.summary.queue_depth, 'number');
  assert.equal(typeof result.summary.active_jobs, 'number');
  assert.ok(result.policies.loops);
});

// --- Repair jobs ---

test('repair_query_enqueued creates queued repair job', async () => {
  const builder = makeBuilder({
    readEvents: async () => [{
      event: 'repair_query_enqueued',
      ts: '2026-01-01T00:01:00Z',
      payload: {
        query: 'razer viper v3 pro weight',
        reason: 'blocked_source',
        field_targets: ['weight'],
        domain: 'razer.com',
      },
    }],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  assert.ok(result.jobs.length >= 1);
  const repairJob = result.jobs.find((j) => j.job_type === 'repair_search');
  assert.ok(repairJob, 'should have a repair_search job');
  assert.ok(repairJob.field_targets.includes('weight'));
  assert.ok(repairJob.reason_tags.includes('blocked_source'));
});

test('repair_search_started transitions job to running', async () => {
  const builder = makeBuilder({
    readEvents: async () => [
      {
        event: 'repair_query_enqueued',
        ts: '2026-01-01T00:01:00Z',
        payload: { query: 'razer viper v3 pro weight', reason: 'blocked_source', field_targets: ['weight'] },
      },
      {
        event: 'repair_search_started',
        ts: '2026-01-01T00:02:00Z',
        payload: { query: 'razer viper v3 pro weight' },
      },
    ],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const repairJob = result.jobs.find((j) => j.job_type === 'repair_search');
  assert.ok(repairJob);
  assert.equal(repairJob.status, 'running');
});

test('repair_search_completed transitions job to done', async () => {
  const builder = makeBuilder({
    readEvents: async () => [
      {
        event: 'repair_query_enqueued',
        ts: '2026-01-01T00:01:00Z',
        payload: { query: 'razer viper v3 pro weight', reason: 'blocked_source', field_targets: ['weight'] },
      },
      {
        event: 'repair_search_completed',
        ts: '2026-01-01T00:03:00Z',
        payload: { query: 'razer viper v3 pro weight', urls_found: 3, urls_seeded: 2 },
      },
    ],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const repairJob = result.jobs.find((j) => j.job_type === 'repair_search');
  assert.ok(repairJob);
  assert.equal(repairJob.status, 'done');
});

test('repair_search_failed transitions job to failed and preserves the surfaced error', async () => {
  const builder = makeBuilder({
    readEvents: async () => [
      {
        event: 'repair_query_enqueued',
        ts: '2026-01-01T00:01:00Z',
        payload: { query: 'acme orbit x1 weight', reason: 'blocked_source', field_targets: ['weight'] },
      },
      {
        event: 'repair_search_failed',
        ts: '2026-01-01T00:03:00Z',
        payload: { query: 'acme orbit x1 weight', error: 'provider_timeout' },
      },
    ],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const repairJob = result.jobs.find((j) => j.job_type === 'repair_search');
  assert.ok(repairJob);
  assert.equal(repairJob.status, 'failed');
  assert.equal(repairJob.last_error, 'provider_timeout');

  const failedAction = result.actions.find((action) => action.event === 'repair_search_failed');
  assert.ok(failedAction);
  assert.equal(failedAction.status, 'failed');
  assert.equal(failedAction.detail, 'provider_timeout');
});

test('duplicate repair queries dedupe by job_id', async () => {
  const builder = makeBuilder({
    readEvents: async () => [
      {
        event: 'repair_query_enqueued',
        ts: '2026-01-01T00:01:00Z',
        payload: { query: 'razer viper v3 pro weight', reason: 'blocked_source', field_targets: ['weight'], domain: 'razer.com' },
      },
      {
        event: 'repair_query_enqueued',
        ts: '2026-01-01T00:02:00Z',
        payload: { query: 'razer viper v3 pro weight', reason: 'blocked_source', field_targets: ['weight'], domain: 'razer.com' },
      },
    ],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const repairJobs = result.jobs.filter((j) => j.job_type === 'repair_search');
  assert.equal(repairJobs.length, 1, 'duplicate repair queries should produce one job');
});

// --- Backoff ---

test('blocked_domain_cooldown_applied creates domain_backoff job', async () => {
  const builder = makeBuilder({
    readEvents: async () => [{
      event: 'blocked_domain_cooldown_applied',
      ts: '2026-01-01T00:01:00Z',
      payload: { domain: 'example.com', status: 429, blocked_count: 3 },
    }],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const backoffJob = result.jobs.find((j) => j.job_type === 'domain_backoff');
  assert.ok(backoffJob, 'should have a domain_backoff job');
  assert.equal(backoffJob.status, 'cooldown');
  assert.ok(backoffJob.reason_tags.includes('status_429_backoff'));
});

test('url_cooldown_applied creates domain_backoff job', async () => {
  const builder = makeBuilder({
    readEvents: async () => [{
      event: 'url_cooldown_applied',
      ts: '2026-01-01T00:01:00Z',
      payload: { reason: 'cooldown', domain: 'example.com', url: 'https://example.com/page' },
    }],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const backoffJob = result.jobs.find((j) => j.job_type === 'domain_backoff');
  assert.ok(backoffJob, 'should have a domain_backoff job');
  assert.equal(backoffJob.status, 'cooldown');
});

// --- Deficit ---

test('needset deficit fields create deficit_rediscovery jobs', async () => {
  const builder = makeBuilder({
    readNeedSet: async () => ({
      generated_at: '2026-01-01T00:05:00Z',
      rows: [
        { field_key: 'sensor', required_level: 'required', priority_bucket: 'core', state: 'missing', bundle_id: null },
        { field_key: 'weight', required_level: 'expected', priority_bucket: 'secondary', state: 'weak', bundle_id: null },
      ],
    }),
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const deficitJobs = result.jobs.filter((j) => j.job_type === 'deficit_rediscovery');
  assert.equal(deficitJobs.length, 2);
  const fields = deficitJobs.flatMap((j) => j.field_targets);
  assert.ok(fields.includes('sensor'));
  assert.ok(fields.includes('weight'));
});

test('deficit jobs skip fields already covered by events', async () => {
  const builder = makeBuilder({
    readNeedSet: async () => ({
      generated_at: '2026-01-01T00:05:00Z',
      rows: [
        { field_key: 'sensor', required_level: 'required', priority_bucket: 'core', state: 'missing', bundle_id: null },
      ],
    }),
    readSearchProfile: async () => ({
      query_rows: [
        { query: 'razer viper sensor', target_fields: ['sensor'], attempts: 2, result_count: 5 },
      ],
    }),
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  const deficitJob = result.jobs.find((j) => j.job_type === 'deficit_rediscovery' && j.field_targets.includes('sensor'));
  assert.ok(deficitJob);
  assert.equal(deficitJob.status, 'done', 'should be done because search profile had results');
});

// --- Actions ---

test('events produce action history entries', async () => {
  const builder = makeBuilder({
    readEvents: async () => [{
      event: 'repair_query_enqueued',
      ts: '2026-01-01T00:01:00Z',
      payload: { query: 'test query', reason: 'blocked_source', field_targets: ['weight'] },
    }],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  assert.ok(result.actions.length >= 1);
  assert.equal(result.actions[0].event, 'repair_query_enqueued');
});

// --- Summary ---

test('summary counts match job statuses and types', async () => {
  const builder = makeBuilder({
    readEvents: async () => [
      {
        event: 'repair_query_enqueued',
        ts: '2026-01-01T00:01:00Z',
        payload: { query: 'q1', reason: 'blocked', field_targets: ['weight'], domain: 'd1.com' },
      },
      {
        event: 'blocked_domain_cooldown_applied',
        ts: '2026-01-01T00:02:00Z',
        payload: { domain: 'example.com', status: 403, blocked_count: 2 },
      },
    ],
  });
  const result = await builder.readIndexLabRunAutomationQueue('run-abc');
  assert.equal(result.summary.total_jobs, result.jobs.length);
  assert.equal(result.summary.repair_search + result.summary.domain_backoff + result.summary.staleness_refresh + result.summary.deficit_rediscovery, result.summary.total_jobs);
});
