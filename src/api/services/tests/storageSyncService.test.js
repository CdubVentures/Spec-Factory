import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageSyncService } from '../storageSyncService.js';

function buildMockCategoryDb(runs = []) {
  return {
    listRunsByStorageState(state) {
      return runs.filter((r) => r.storage_state === state);
    },
    countRunsByStorageState() {
      const counts = {};
      for (const r of runs) {
        counts[r.storage_state] = (counts[r.storage_state] || 0) + 1;
      }
      return Object.entries(counts).map(([storage_state, count]) => ({ storage_state, count }));
    },
    updateRunStorageLocation(opts) {
      const run = runs.find((r) => r.run_id === opts.runId && r.product_id === opts.productId);
      if (run) run.storage_state = opts.storageState;
    },
  };
}

describe('storageSyncService', () => {
  describe('syncStatus', () => {
    it('aggregates counts across categories', async () => {
      const service = createStorageSyncService({
        getCategoryDbs: () => ({
          mouse: buildMockCategoryDb([
            { run_id: 'r1', product_id: 'p1', storage_state: 'live' },
            { run_id: 'r2', product_id: 'p2', storage_state: 'local' },
          ]),
          keyboard: buildMockCategoryDb([
            { run_id: 'r3', product_id: 'p3', storage_state: 's3' },
            { run_id: 'r4', product_id: 'p4', storage_state: 'synced' },
          ]),
        }),
      });

      const status = await service.syncStatus();
      assert.equal(status.live, 1);
      assert.equal(status.local, 1);
      assert.equal(status.s3, 1);
      assert.equal(status.synced, 1);
    });

    it('returns zeros when no runs exist', async () => {
      const service = createStorageSyncService({
        getCategoryDbs: () => ({ mouse: buildMockCategoryDb([]) }),
      });

      const status = await service.syncStatus();
      assert.equal(status.live, 0);
      assert.equal(status.local, 0);
      assert.equal(status.s3, 0);
      assert.equal(status.synced, 0);
    });
  });

  describe('pushAllToS3', () => {
    it('relocates local-only runs and updates state to synced', async () => {
      const relocated = [];
      const runs = [
        { run_id: 'r1', product_id: 'p1', category: 'mouse', storage_state: 'local', local_path: '/archive/mouse/p1/r1' },
        { run_id: 'r2', product_id: 'p2', category: 'mouse', storage_state: 'synced' },
      ];

      const service = createStorageSyncService({
        getCategoryDbs: () => ({ mouse: buildMockCategoryDb(runs) }),
        relocateToS3: async ({ runMeta }) => {
          relocated.push(runMeta.run_id);
          return { ok: true, s3_prefix: `pfx/${runMeta.run_id}` };
        },
      });

      const result = await service.pushAllToS3();
      assert.equal(result.pushed, 1);
      assert.deepEqual(relocated, ['r1']);
      assert.equal(runs[0].storage_state, 'synced');
    });

    it('returns zero pushed when no local-only runs exist', async () => {
      const service = createStorageSyncService({
        getCategoryDbs: () => ({ mouse: buildMockCategoryDb([]) }),
        relocateToS3: async () => ({ ok: true }),
      });

      const result = await service.pushAllToS3();
      assert.equal(result.pushed, 0);
      assert.equal(result.errors.length, 0);
    });

    it('collects errors for failed uploads', async () => {
      const runs = [
        { run_id: 'r1', product_id: 'p1', category: 'mouse', storage_state: 'local', local_path: '/a' },
        { run_id: 'r2', product_id: 'p2', category: 'mouse', storage_state: 'local', local_path: '/b' },
      ];

      const service = createStorageSyncService({
        getCategoryDbs: () => ({ mouse: buildMockCategoryDb(runs) }),
        relocateToS3: async ({ runMeta }) => {
          if (runMeta.run_id === 'r1') throw new Error('upload_failed');
          return { ok: true, s3_prefix: 'pfx/r2' };
        },
      });

      const result = await service.pushAllToS3();
      assert.equal(result.pushed, 1);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].run_id, 'r1');
      assert.ok(result.errors[0].error.includes('upload_failed'));
    });
  });

  describe('pullAllFromS3', () => {
    it('materializes s3-only runs and updates state to synced', async () => {
      const materialized = [];
      const runs = [
        { run_id: 'r1', product_id: 'p1', category: 'mouse', storage_state: 's3', s3_key: 'pfx/mouse/p1/r1' },
        { run_id: 'r2', product_id: 'p2', category: 'mouse', storage_state: 'local' },
      ];

      const service = createStorageSyncService({
        getCategoryDbs: () => ({ mouse: buildMockCategoryDb(runs) }),
        materializeFromS3: async ({ runId, s3Key }) => {
          materialized.push(runId);
          return '/local/path/' + runId;
        },
      });

      const result = await service.pullAllFromS3();
      assert.equal(result.pulled, 1);
      assert.deepEqual(materialized, ['r1']);
      assert.equal(runs[0].storage_state, 'synced');
    });

    it('returns zero pulled when no s3-only runs exist', async () => {
      const service = createStorageSyncService({
        getCategoryDbs: () => ({ mouse: buildMockCategoryDb([]) }),
        materializeFromS3: async () => '',
      });

      const result = await service.pullAllFromS3();
      assert.equal(result.pulled, 0);
      assert.equal(result.errors.length, 0);
    });

    it('collects errors for failed downloads', async () => {
      const runs = [
        { run_id: 'r1', product_id: 'p1', category: 'mouse', storage_state: 's3', s3_key: 'pfx/r1' },
      ];

      const service = createStorageSyncService({
        getCategoryDbs: () => ({ mouse: buildMockCategoryDb(runs) }),
        materializeFromS3: async () => { throw new Error('download_failed'); },
      });

      const result = await service.pullAllFromS3();
      assert.equal(result.pulled, 0);
      assert.equal(result.errors.length, 1);
      assert.ok(result.errors[0].error.includes('download_failed'));
    });
  });
});
