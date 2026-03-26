import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return { specDb: new SpecDb({ dbPath: ':memory:', category: 'mouse' }) };
}

async function cleanupHarness(harness) {
  try {
    harness?.specDb?.close?.();
  } catch {
    // best-effort
  }
}

test('SpecDb recordSpecDbSync persists and increments specdb_sync_version', async () => {
  const harness = createHarness();
  try {
    const initial = harness.specDb.getSpecDbSyncState();
    assert.equal(initial.specdb_sync_version, 0);
    assert.equal(initial.last_sync_status, 'unknown');

    const first = harness.specDb.recordSpecDbSync({
      status: 'ok',
      meta: { components_seeded: 5 },
      at: '2026-02-23T12:00:00.000Z',
    });
    assert.equal(first.specdb_sync_version, 1);
    assert.equal(first.last_sync_status, 'ok');
    assert.equal(first.last_sync_at, '2026-02-23T12:00:00.000Z');
    assert.equal(first.last_sync_meta.components_seeded, 5);

    const second = harness.specDb.recordSpecDbSync({
      status: 'ok',
      meta: { components_seeded: 8 },
      at: '2026-02-23T13:00:00.000Z',
    });
    assert.equal(second.specdb_sync_version, 2);
    assert.equal(second.last_sync_meta.components_seeded, 8);

    const reopened = harness.specDb.getSpecDbSyncState('mouse');
    assert.equal(reopened.specdb_sync_version, 2);
    assert.equal(reopened.last_sync_status, 'ok');
  } finally {
    await cleanupHarness(harness);
  }
});
