import test from 'node:test';
import assert from 'node:assert/strict';
import { syncSpecDbForCategory } from '../src/api/services/specDbSyncService.js';

test('syncSpecDbForCategory seeds SpecDb from latest field rules for resolved category', async () => {
  const calls = {
    getSpecDbReady: [],
    loadFieldRules: [],
    seedSpecDb: [],
    recordSpecDbSync: [],
  };
  const fakeDb = {
    category: 'mouse',
    recordSpecDbSync: (payload) => {
      calls.recordSpecDbSync.push(payload);
      return {
        category: 'mouse',
        specdb_sync_version: 7,
        last_sync_at: '2026-02-23T12:00:00.000Z',
        last_sync_status: 'ok',
      };
    },
  };
  const result = await syncSpecDbForCategory({
    category: 'Mouse',
    config: { categoryAuthorityRoot: 'category_authority' },
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    getSpecDbReady: async (category) => {
      calls.getSpecDbReady.push(category);
      return fakeDb;
    },
    loadFieldRules: async (category, options) => {
      calls.loadFieldRules.push({ category, options });
      return { fields: { dpi: { type: 'number' } } };
    },
    seedSpecDb: async (payload) => {
      calls.seedSpecDb.push(payload);
      return { components_seeded: 5, list_values_seeded: 8 };
    },
  });

  assert.deepEqual(calls.getSpecDbReady, ['mouse']);
  assert.equal(calls.loadFieldRules.length, 1);
  assert.equal(calls.loadFieldRules[0].category, 'mouse');
  assert.equal(calls.seedSpecDb.length, 1);
  assert.equal(calls.seedSpecDb[0].db, fakeDb);
  assert.equal(calls.seedSpecDb[0].category, 'mouse');
  assert.equal(calls.recordSpecDbSync.length, 1);
  assert.equal(calls.recordSpecDbSync[0].status, 'ok');
  assert.equal(result.category, 'mouse');
  assert.equal(result.components_seeded, 5);
  assert.equal(result.list_values_seeded, 8);
  assert.equal(result.specdb_sync_version, 7);
  assert.equal(result.specdb_sync_updated_at, '2026-02-23T12:00:00.000Z');
});

test('syncSpecDbForCategory throws when SpecDb is unavailable', async () => {
  await assert.rejects(
    () => syncSpecDbForCategory({
      category: 'mouse',
      config: {},
      getSpecDbReady: async () => null,
      loadFieldRules: async () => ({ fields: {} }),
      seedSpecDb: async () => ({}),
    }),
    /specdb_unavailable:mouse/,
  );
});
