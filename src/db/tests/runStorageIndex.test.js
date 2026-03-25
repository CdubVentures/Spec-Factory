import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../specDb.js';

const TEST_DIR = path.join('.specfactory_tmp', '_test_run_storage_index');
const DB_PATH = path.join(TEST_DIR, 'spec.sqlite');

describe('runStorageIndex', () => {
  let db;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    db = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(DB_PATH); } catch { /* */ }
    try { fs.rmdirSync(TEST_DIR); } catch { /* */ }
  });

  it('product_runs table has storage columns with correct defaults', () => {
    db.upsertProductRun({
      product_id: 'prod-defaults',
      run_id: 'run-defaults-001',
      is_latest: true,
      run_at: '2026-03-24T10:00:00Z',
    });

    const location = db.getRunStorageLocation({
      productId: 'prod-defaults',
      runId: 'run-defaults-001',
    });

    assert.ok(location, 'should return a row');
    assert.equal(location.storage_state, 'live');
    assert.equal(location.local_path, '');
    assert.equal(location.s3_key, '');
    assert.equal(location.size_bytes, 0);
    assert.equal(location.relocated_at, '');
  });

  it('updateRunStorageLocation sets storage columns', () => {
    db.upsertProductRun({
      product_id: 'prod-local',
      run_id: 'run-local-001',
      is_latest: true,
      run_at: '2026-03-24T11:00:00Z',
    });

    db.updateRunStorageLocation({
      productId: 'prod-local',
      runId: 'run-local-001',
      storageState: 'local',
      localPath: '/home/user/SpecFactoryRuns/mouse/prod-local/run-local-001',
      s3Key: '',
      sizeBytes: 45230,
      relocatedAt: '2026-03-24T11:05:00Z',
    });

    const location = db.getRunStorageLocation({
      productId: 'prod-local',
      runId: 'run-local-001',
    });

    assert.equal(location.storage_state, 'local');
    assert.equal(location.local_path, '/home/user/SpecFactoryRuns/mouse/prod-local/run-local-001');
    assert.equal(location.s3_key, '');
    assert.equal(location.size_bytes, 45230);
    assert.equal(location.relocated_at, '2026-03-24T11:05:00Z');
  });

  it('updateRunStorageLocation to synced with both paths', () => {
    db.upsertProductRun({
      product_id: 'prod-synced',
      run_id: 'run-synced-001',
      is_latest: true,
      run_at: '2026-03-24T12:00:00Z',
    });

    db.updateRunStorageLocation({
      productId: 'prod-synced',
      runId: 'run-synced-001',
      storageState: 'synced',
      localPath: '/home/user/SpecFactoryRuns/mouse/prod-synced/run-synced-001',
      s3Key: 'spec-factory-runs/mouse/prod-synced/run-synced-001',
      sizeBytes: 102400,
      relocatedAt: '2026-03-24T12:10:00Z',
    });

    const location = db.getRunStorageLocation({
      productId: 'prod-synced',
      runId: 'run-synced-001',
    });

    assert.equal(location.storage_state, 'synced');
    assert.ok(location.local_path);
    assert.ok(location.s3_key);
  });

  it('listRunsByStorageState filters correctly', () => {
    const localRuns = db.listRunsByStorageState('local');
    const syncedRuns = db.listRunsByStorageState('synced');
    const liveRuns = db.listRunsByStorageState('live');

    assert.ok(localRuns.some((r) => r.run_id === 'run-local-001'));
    assert.ok(syncedRuns.some((r) => r.run_id === 'run-synced-001'));
    assert.ok(liveRuns.some((r) => r.run_id === 'run-defaults-001'));

    assert.ok(!localRuns.some((r) => r.run_id === 'run-synced-001'));
    assert.ok(!syncedRuns.some((r) => r.run_id === 'run-local-001'));
  });

  it('countRunsByStorageState groups correctly', () => {
    const counts = db.countRunsByStorageState();

    const liveCount = counts.find((c) => c.storage_state === 'live');
    const localCount = counts.find((c) => c.storage_state === 'local');
    const syncedCount = counts.find((c) => c.storage_state === 'synced');

    assert.ok(liveCount, 'should have live count');
    assert.ok(localCount, 'should have local count');
    assert.ok(syncedCount, 'should have synced count');
    assert.ok(liveCount.count >= 1);
    assert.ok(localCount.count >= 1);
    assert.ok(syncedCount.count >= 1);
  });

  it('getRunStorageLocation returns null for missing run', () => {
    const location = db.getRunStorageLocation({
      productId: 'nonexistent',
      runId: 'nonexistent',
    });
    assert.equal(location, null);
  });

  it('updateRunStorageLocation on missing run is a no-op', () => {
    db.updateRunStorageLocation({
      productId: 'ghost',
      runId: 'ghost-run',
      storageState: 'local',
      localPath: '/tmp/ghost',
      s3Key: '',
      sizeBytes: 0,
      relocatedAt: '',
    });

    const location = db.getRunStorageLocation({
      productId: 'ghost',
      runId: 'ghost-run',
    });
    assert.equal(location, null);
  });
});
