import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createSpecDbRuntime } from '../specDbRuntime.js';

function createSyncResult(overrides = {}) {
  return {
    components_seeded: 0,
    list_values_seeded: 0,
    products_seeded: 0,
    duration_ms: 0,
    specdb_sync_version: 0,
    ...overrides,
  };
}

test('specdb runtime reuses seeded db handles immediately', async () => {
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
    syncSpecDbForCategory: async () => createSyncResult(),
    config: { localMode: true },
    logger: { log: () => {}, error: () => {} },
  });

  const first = runtime.getSpecDb('mouse');
  const second = runtime.getSpecDb('mouse');
  assert.equal(first, second);
  assert.equal(first?.category, 'mouse');

  const ready = await runtime.getSpecDbReady('mouse');
  assert.equal(ready, first);
});

test('specdb runtime keeps the cached db handle available when auto-seed fails', async () => {
  const syncCategories = [];
  const errorLogs = [];

  class UnseededDb {
    constructor({ dbPath, category }) {
      this.dbPath = dbPath;
      this.category = category;
    }
    isSeeded() {
      return false;
    }
  }

  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: UnseededDb,
    path,
    fsSync: {
      accessSync: () => {
        throw new Error('missing');
      },
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async ({ category }) => {
      syncCategories.push(category);
      throw new Error('seed failed');
    },
    config: { localMode: true },
    logger: {
      log: () => {},
      error: (...args) => {
        errorLogs.push(args.map((part) => String(part)).join(' '));
      },
    },
  });

  const db = runtime.getSpecDb('mouse');
  assert.ok(db);
  assert.equal(db.category, 'mouse');

  const ready = await runtime.getSpecDbReady('mouse');
  assert.equal(ready, db);
  assert.deepEqual(syncCategories, ['mouse']);
  assert.equal(
    errorLogs.some((entry) => entry.includes('[auto-seed] mouse failed:') && entry.includes('seed failed')),
    true,
  );
});

test('specdb runtime rejects the "all" sentinel — getSpecDb and getSpecDbReady return null without creating a database', async () => {
  let dbCreated = false;

  class TrackingDb {
    constructor({ dbPath, category }) {
      dbCreated = true;
      this.dbPath = dbPath;
      this.category = category;
    }
    isSeeded() {
      return true;
    }
  }

  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: TrackingDb,
    path,
    fsSync: {
      accessSync: () => {},
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => createSyncResult(),
    config: { localMode: true },
    logger: { log: () => {}, error: () => {} },
  });

  const db = runtime.getSpecDb('all');
  assert.equal(db, null, 'getSpecDb("all") must return null');
  assert.equal(dbCreated, false, 'no database should be created for "all"');

  const ready = await runtime.getSpecDbReady('all');
  assert.equal(ready, null, 'getSpecDbReady("all") must return null');
});
