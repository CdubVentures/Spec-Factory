import test from 'node:test';
import assert from 'node:assert/strict';
import { syncSpecDbForCategory } from '../specDbSyncService.js';

function createSyncState(overrides = {}) {
  return {
    category: 'mouse',
    specdb_sync_version: 7,
    last_sync_at: '2026-02-23T12:00:00.000Z',
    last_sync_status: 'ok',
    ...overrides,
  };
}

function createSpecDb(overrides = {}) {
  const {
    syncState = createSyncState(),
    ...rest
  } = overrides;
  const hasRecordSpecDbSync = Object.hasOwn(overrides, 'recordSpecDbSync');
  const hasGetSpecDbSyncState = Object.hasOwn(overrides, 'getSpecDbSyncState');
  const recordSpecDbSync = hasRecordSpecDbSync ? overrides.recordSpecDbSync : (() => syncState);
  const getSpecDbSyncState = hasGetSpecDbSyncState ? overrides.getSpecDbSyncState : (() => syncState);

  return {
    category: 'mouse',
    ...(recordSpecDbSync === undefined
      ? {}
      : {
        recordSpecDbSync: recordSpecDbSync || (() => syncState),
      }),
    ...(getSpecDbSyncState === undefined
      ? {}
      : {
        getSpecDbSyncState: getSpecDbSyncState || (() => syncState),
      }),
    ...rest,
  };
}

function createSyncHarness(overrides = {}) {
  const {
    db = createSpecDb(),
    resolveCategoryAlias = (value) => String(value || '').trim().toLowerCase(),
    loadFieldRules = async () => ({ fields: { dpi: { type: 'number' } } }),
    seedSpecDb = async () => ({ components_seeded: 5, list_values_seeded: 8 }),
    getSpecDbReady = async () => db,
    config = { categoryAuthorityRoot: 'category_authority' },
  } = overrides;

  return {
    sync(category = 'Mouse', extra = {}) {
      return syncSpecDbForCategory({
        category,
        config,
        resolveCategoryAlias,
        getSpecDbReady,
        loadFieldRules,
        seedSpecDb,
        ...extra,
      });
    },
  };
}

test('syncSpecDbForCategory returns the sync summary for the resolved category', async () => {
  const harness = createSyncHarness();

  const result = await harness.sync();

  assert.deepEqual(result, {
    category: 'mouse',
    components_seeded: 5,
    list_values_seeded: 8,
    specdb_sync_version: 7,
    specdb_sync_updated_at: '2026-02-23T12:00:00.000Z',
  });
});

test('syncSpecDbForCategory still returns sync data when the db does not expose sync recording', async () => {
  const harness = createSyncHarness({
    db: createSpecDb({
      recordSpecDbSync: undefined,
      getSpecDbSyncState: undefined,
    }),
  });

  const result = await harness.sync('mouse');

  assert.deepEqual(result, {
    category: 'mouse',
    components_seeded: 5,
    list_values_seeded: 8,
  });
});

test('syncSpecDbForCategory throws when the category is missing', async () => {
  const harness = createSyncHarness();

  await assert.rejects(() => harness.sync('   '), /category_required/);
});

test('syncSpecDbForCategory throws when SpecDb is unavailable', async () => {
  const harness = createSyncHarness({
    getSpecDbReady: async () => null,
  });

  await assert.rejects(() => harness.sync('mouse'), /specdb_unavailable:mouse/);
});

test('syncSpecDbForCategory annotates failures with sync metadata when the db records a failed sync', async () => {
  const harness = createSyncHarness({
    db: createSpecDb({
      syncState: createSyncState({
        specdb_sync_version: 8,
        last_sync_at: '2026-02-24T09:30:00.000Z',
        last_sync_status: 'failed',
      }),
    }),
    seedSpecDb: async () => {
      throw new Error('seed failed');
    },
  });

  await assert.rejects(
    () => harness.sync('mouse'),
    (error) => {
      assert.equal(error.message, 'seed failed');
      assert.equal(error.specdb_sync_version, 8);
      assert.equal(error.specdb_sync_updated_at, '2026-02-24T09:30:00.000Z');
      assert.equal(error.specdb_sync_status, 'failed');
      return true;
    },
  );
});
