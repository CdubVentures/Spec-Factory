// WHY: Wave 5.5 — writeRunMeta now writes SQL only (slim schema).
// JSON file writes eliminated. run-summary.json replaces run.json.

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeRunMeta } from '../runtimeBridgeArtifacts.js';
import { SpecDb } from '../../db/specDb.js';

function buildMockState(overrides = {}) {
  return {
    runId: 'run-meta-001',
    startedAt: '2026-03-26T10:00:00.000Z',
    endedAt: '',
    status: 'running',
    context: { category: 'mouse', productId: 'mouse-razer-viper', s3Key: 'specs/inputs/mouse/products/mouse-razer-viper.json' },
    outRoot: '/tmp/indexlab',
    counters: { pages_checked: 5, fetched_ok: 3, fetched_404: 0, fetched_blocked: 0, fetched_error: 0 },
    identityFingerprint: 'fp-test',
    identityLockStatus: 'locked',
    dedupeMode: 'content_hash',
    stageCursor: 'stage:search',
    specDb: null,
    ...overrides,
  };
}

test('writeRunMeta writes to SQL with slim columns', async () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  const state = buildMockState({ specDb });

  await writeRunMeta(state);

  const sqlRow = specDb.getRunByRunId('run-meta-001');
  assert.ok(sqlRow, 'SQL row should exist');
  assert.equal(sqlRow.status, 'running');
  assert.equal(sqlRow.category, 'mouse');
  assert.equal(sqlRow.product_id, 'mouse-razer-viper');
  assert.equal(sqlRow.stage_cursor, 'stage:search');
  assert.equal(sqlRow.identity_fingerprint, 'fp-test');
  assert.deepEqual(sqlRow.counters, { pages_checked: 5, fetched_ok: 3, fetched_404: 0, fetched_blocked: 0, fetched_error: 0 });
});

test('writeRunMeta extra param overrides status and ended_at', async () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  const state = buildMockState({ specDb });

  await writeRunMeta(state, {
    status: 'completed',
    ended_at: '2026-03-26T10:30:00.000Z',
  });

  const sqlRow = specDb.getRunByRunId('run-meta-001');
  assert.equal(sqlRow.status, 'completed');
  assert.equal(sqlRow.ended_at, '2026-03-26T10:30:00.000Z');
});

test('SQL write is best-effort — no crash if specDb is null', async () => {
  const state = buildMockState({ specDb: null });
  await writeRunMeta(state);
});

test('guard uses runId — skips if runId is empty', async () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  const state = buildMockState({ runId: '', specDb });
  await writeRunMeta(state);
  const sqlRow = specDb.getRunByRunId('');
  assert.equal(sqlRow, null, 'no row for empty runId');
});

test('writeRunMeta with specDb writes SQL row', async () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  const state = buildMockState({ specDb });

  await writeRunMeta(state);

  const sqlRow = specDb.getRunByRunId('run-meta-001');
  assert.ok(sqlRow, 'SQL row should exist');
  assert.equal(sqlRow.run_id, 'run-meta-001');
});
