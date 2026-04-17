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

// ── Per-file seed hash helpers ────────────────────────────────────────────────

test('getFileSeedHash returns null for unknown key', async () => {
  const harness = createHarness();
  try {
    assert.equal(harness.specDb.getFileSeedHash('nonexistent'), null);
  } finally {
    await cleanupHarness(harness);
  }
});

test('setFileSeedHash + getFileSeedHash round-trip', async () => {
  const harness = createHarness();
  try {
    harness.specDb.setFileSeedHash('overrides', 'abc123');
    assert.equal(harness.specDb.getFileSeedHash('overrides'), 'abc123');
  } finally {
    await cleanupHarness(harness);
  }
});

test('multiple file hashes do not clobber each other', async () => {
  const harness = createHarness();
  try {
    harness.specDb.setFileSeedHash('overrides', 'hash_a');
    harness.specDb.setFileSeedHash('color_edition', 'hash_b');
    harness.specDb.setFileSeedHash('field_studio_map', 'hash_c');
    assert.equal(harness.specDb.getFileSeedHash('overrides'), 'hash_a');
    assert.equal(harness.specDb.getFileSeedHash('color_edition'), 'hash_b');
    assert.equal(harness.specDb.getFileSeedHash('field_studio_map'), 'hash_c');
  } finally {
    await cleanupHarness(harness);
  }
});

test('setFileSeedHash overwrites previous value for same key', async () => {
  const harness = createHarness();
  try {
    harness.specDb.setFileSeedHash('overrides', 'old_hash');
    harness.specDb.setFileSeedHash('overrides', 'new_hash');
    assert.equal(harness.specDb.getFileSeedHash('overrides'), 'new_hash');
  } finally {
    await cleanupHarness(harness);
  }
});

test('file hashes survive alongside existing sync meta', async () => {
  const harness = createHarness();
  try {
    harness.specDb.recordSpecDbSync({
      status: 'ok',
      meta: { field_rules_signature: 'sig_123', components_seeded: 5 },
    });
    harness.specDb.setFileSeedHash('overrides', 'hash_x');
    const state = harness.specDb.getSpecDbSyncState();
    assert.equal(state.last_sync_meta.field_rules_signature, 'sig_123');
    assert.equal(state.last_sync_meta.file_hashes.overrides, 'hash_x');
  } finally {
    await cleanupHarness(harness);
  }
});
