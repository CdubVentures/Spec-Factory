// WHY: B14 — orphan runs.status='running' never transitions when the process
// dies uncleanly (crash, kill, timeout). sweepOrphanRuns() is the boot-time
// reconciliation that marks stale running rows as aborted so the GUI stops
// showing them as in-progress.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return { specDb: new SpecDb({ dbPath: ':memory:', category: 'mouse' }) };
}

function sampleRun(overrides = {}) {
  return {
    run_id: 'run-sweep-base',
    category: 'mouse',
    product_id: 'mouse-test',
    status: 'running',
    started_at: '2026-04-22T00:00:00.000Z',
    ended_at: '',
    stage_cursor: 'stage:bootstrap',
    identity_fingerprint: '',
    identity_lock_status: '',
    dedupe_mode: '',
    s3key: '',
    out_root: '',
    counters: {},
    ...overrides,
  };
}

function ageRow(specDb, runId, minutesAgo) {
  // WHY: upsertRun always sets updated_at=datetime('now'). To simulate an
  // orphan, we reach in and push updated_at back by N minutes.
  specDb.db.prepare(`UPDATE runs SET updated_at = datetime('now', ?) WHERE run_id = ?`)
    .run(`-${minutesAgo} minutes`, runId);
}

test('sweepOrphanRuns marks orphan running rows as aborted', () => {
  const { specDb } = createHarness();
  specDb.upsertRun(sampleRun({ run_id: 'orphan-1', status: 'running' }));
  ageRow(specDb, 'orphan-1', 120);

  const result = specDb.sweepOrphanRuns({ maxAgeMinutes: 60 });

  assert.equal(result.swept, 1);
  const after = specDb.getRunByRunId('orphan-1');
  assert.equal(after.status, 'aborted');
  assert.ok(after.ended_at, 'ended_at populated on sweep');
});

test('sweepOrphanRuns leaves recent running rows alone', () => {
  const { specDb } = createHarness();
  specDb.upsertRun(sampleRun({ run_id: 'fresh-1', status: 'running' }));

  const result = specDb.sweepOrphanRuns({ maxAgeMinutes: 60 });

  assert.equal(result.swept, 0);
  const after = specDb.getRunByRunId('fresh-1');
  assert.equal(after.status, 'running');
});

test('sweepOrphanRuns never touches non-running rows regardless of age', () => {
  const { specDb } = createHarness();
  specDb.upsertRun(sampleRun({ run_id: 'old-completed', status: 'completed' }));
  specDb.upsertRun(sampleRun({ run_id: 'old-aborted', status: 'aborted' }));
  specDb.upsertRun(sampleRun({ run_id: 'old-failed', status: 'failed' }));
  ageRow(specDb, 'old-completed', 1440);
  ageRow(specDb, 'old-aborted', 1440);
  ageRow(specDb, 'old-failed', 1440);

  const result = specDb.sweepOrphanRuns({ maxAgeMinutes: 60 });

  assert.equal(result.swept, 0);
  assert.equal(specDb.getRunByRunId('old-completed').status, 'completed');
  assert.equal(specDb.getRunByRunId('old-aborted').status, 'aborted');
  assert.equal(specDb.getRunByRunId('old-failed').status, 'failed');
});

test('sweepOrphanRuns handles empty table without error', () => {
  const { specDb } = createHarness();
  const result = specDb.sweepOrphanRuns({ maxAgeMinutes: 60 });
  assert.equal(result.swept, 0);
});

test('sweepOrphanRuns honors custom maxAgeMinutes', () => {
  const { specDb } = createHarness();
  specDb.upsertRun(sampleRun({ run_id: 'mid-1', status: 'running' }));
  ageRow(specDb, 'mid-1', 45);

  const under = specDb.sweepOrphanRuns({ maxAgeMinutes: 60 });
  assert.equal(under.swept, 0, '45 min with 60 min threshold should not sweep');
  assert.equal(specDb.getRunByRunId('mid-1').status, 'running');

  const over = specDb.sweepOrphanRuns({ maxAgeMinutes: 30 });
  assert.equal(over.swept, 1, '45 min with 30 min threshold should sweep');
  assert.equal(specDb.getRunByRunId('mid-1').status, 'aborted');
});

test('sweepOrphanRuns sweeps multiple orphans in one call', () => {
  const { specDb } = createHarness();
  specDb.upsertRun(sampleRun({ run_id: 'orphan-a', status: 'running' }));
  specDb.upsertRun(sampleRun({ run_id: 'orphan-b', status: 'running' }));
  specDb.upsertRun(sampleRun({ run_id: 'orphan-c', status: 'running' }));
  specDb.upsertRun(sampleRun({ run_id: 'fresh-d', status: 'running' }));
  ageRow(specDb, 'orphan-a', 120);
  ageRow(specDb, 'orphan-b', 120);
  ageRow(specDb, 'orphan-c', 120);
  // fresh-d stays at datetime('now')

  const result = specDb.sweepOrphanRuns({ maxAgeMinutes: 60 });
  assert.equal(result.swept, 3);
  assert.equal(specDb.getRunByRunId('orphan-a').status, 'aborted');
  assert.equal(specDb.getRunByRunId('orphan-b').status, 'aborted');
  assert.equal(specDb.getRunByRunId('orphan-c').status, 'aborted');
  assert.equal(specDb.getRunByRunId('fresh-d').status, 'running');
});

test('sweepOrphanRuns defaults to 60 minutes when maxAgeMinutes omitted', () => {
  const { specDb } = createHarness();
  specDb.upsertRun(sampleRun({ run_id: 'orphan-default', status: 'running' }));
  ageRow(specDb, 'orphan-default', 61);

  const result = specDb.sweepOrphanRuns();
  assert.equal(result.swept, 1);
});
