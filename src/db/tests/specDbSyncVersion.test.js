import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../specDb.js';

async function createHarness() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'specdb-sync-version-'));
  const dbPath = path.join(tempRoot, 'spec.sqlite');
  const specDb = new SpecDb({ dbPath, category: 'mouse' });
  return { tempRoot, specDb };
}

async function cleanupHarness(harness) {
  try {
    harness?.specDb?.close?.();
  } catch {
    // best-effort
  }
  await fs.rm(harness.tempRoot, { recursive: true, force: true });
}

test('SpecDb recordSpecDbSync persists and increments specdb_sync_version', async () => {
  const harness = await createHarness();
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
