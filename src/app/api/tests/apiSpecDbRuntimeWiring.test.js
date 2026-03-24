import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSpecDbRuntime } from '../specDbRuntime.js';

test('specdb runtime returns cached seeded db without triggering auto-seed', async () => {
  let syncCalls = 0;
  class SeededDb {
    constructor({ dbPath, category }) {
      this.dbPath = dbPath;
      this.category = category;
    }
    isSeeded() {
      return true;
    }
  }

  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: SeededDb,
    path,
    fsSync: {
      accessSync: () => {},
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => {
      syncCalls += 1;
      return {
        components_seeded: 0,
        list_values_seeded: 0,
        products_seeded: 0,
        duration_ms: 0,
        specdb_sync_version: 0,
      };
    },
    config: { localMode: true },
    logger: { log: () => {}, error: () => {} },
  });

  const first = runtime.getSpecDb('mouse');
  const second = runtime.getSpecDb('mouse');
  assert.equal(first, second);
  assert.equal(first?.category, 'mouse');

  const ready = await runtime.getSpecDbReady('mouse');
  assert.equal(ready, first);
  assert.equal(syncCalls, 0);
});

test('specdb runtime triggers auto-seed for unseeded db and resolves ready handle', async () => {
  let syncCalls = 0;
  const syncCategories = [];
  class UnseededDb {
    constructor({ dbPath, category }) {
      this.dbPath = dbPath;
      this.category = category;
      this.isSeededCallCount = 0;
    }
    isSeeded() {
      this.isSeededCallCount += 1;
      return false;
    }
  }

  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => (String(value || '').trim() === 'test_mouse' ? '_test_mouse' : String(value || '').trim()),
    specDbClass: UnseededDb,
    path,
    fsSync: {
      accessSync: () => {
        throw new Error('missing');
      },
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async ({ category }) => {
      syncCalls += 1;
      syncCategories.push(category);
      return {
        components_seeded: 3,
        list_values_seeded: 4,
        products_seeded: 5,
        duration_ms: 1,
        specdb_sync_version: 7,
      };
    },
    config: { localMode: true },
    logger: { log: () => {}, error: () => {} },
  });

  const db = runtime.getSpecDb('test_mouse');
  assert.ok(db);
  assert.equal(db.category, '_test_mouse');

  const ready = await runtime.getSpecDbReady('test_mouse');
  assert.equal(ready, db);
  assert.equal(syncCalls, 1);
  assert.deepEqual(syncCategories, ['_test_mouse']);
});
