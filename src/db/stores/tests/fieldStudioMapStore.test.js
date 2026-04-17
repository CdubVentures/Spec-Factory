import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SCHEMA } from '../../specDbSchema.js';
import { applyMigrations } from '../../specDbMigrations.js';
import { createFieldStudioMapStore } from '../fieldStudioMapStore.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  applyMigrations(db);
  return db;
}

function makeStore(db) {
  const stmts = {
    _getFieldStudioMap: db.prepare(
      'SELECT map_json, map_hash, compiled_rules, boot_config, updated_at FROM field_studio_map WHERE id = 1'
    ),
    _upsertFieldStudioMap: db.prepare(`
      INSERT INTO field_studio_map (id, map_json, map_hash, updated_at)
      VALUES (1, @map_json, @map_hash, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        map_json = excluded.map_json,
        map_hash = excluded.map_hash,
        updated_at = CASE
          WHEN field_studio_map.map_hash != excluded.map_hash THEN datetime('now')
          ELSE field_studio_map.updated_at
        END
    `),
    _upsertCompiledRules: db.prepare(`
      INSERT INTO field_studio_map (id, compiled_rules, boot_config)
      VALUES (1, @compiled_rules, @boot_config)
      ON CONFLICT(id) DO UPDATE SET
        compiled_rules = excluded.compiled_rules,
        boot_config = excluded.boot_config
    `),
  };
  return createFieldStudioMapStore({ stmts });
}

test('getFieldStudioMap returns null when table is empty', () => {
  const db = createTestDb();
  const store = makeStore(db);
  assert.equal(store.getFieldStudioMap(), null);
  db.close();
});

test('upsert + get round-trip returns correct data', () => {
  const db = createTestDb();
  const store = makeStore(db);
  const mapJson = JSON.stringify({ selected_keys: ['dpi', 'weight'], field_overrides: {} });
  const mapHash = 'abc123';

  store.upsertFieldStudioMap(mapJson, mapHash);
  const row = store.getFieldStudioMap();

  assert.equal(row.map_json, mapJson);
  assert.equal(row.map_hash, mapHash);
  assert.equal(typeof row.updated_at, 'string');
  assert.ok(row.updated_at.length > 0);
  db.close();
});

test('upsert overwrites previous row', () => {
  const db = createTestDb();
  const store = makeStore(db);

  store.upsertFieldStudioMap('{"v":1}', 'hash1');
  store.upsertFieldStudioMap('{"v":2}', 'hash2');
  const row = store.getFieldStudioMap();

  assert.equal(row.map_json, '{"v":2}');
  assert.equal(row.map_hash, 'hash2');
  db.close();
});

test('map_hash stored and returned correctly', () => {
  const db = createTestDb();
  const store = makeStore(db);
  const hash = 'sha256:deadbeef01234567';

  store.upsertFieldStudioMap('{}', hash);
  assert.equal(store.getFieldStudioMap().map_hash, hash);
  db.close();
});

test('updated_at auto-populated on upsert', () => {
  const db = createTestDb();
  const store = makeStore(db);

  store.upsertFieldStudioMap('{}', 'h1');
  const row = store.getFieldStudioMap();

  // WHY: SQLite datetime('now') returns ISO-ish format YYYY-MM-DD HH:MM:SS
  assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}/);
  db.close();
});

test('upsert with unchanged hash preserves updated_at (compile re-sync must not bump timestamp)', () => {
  const db = createTestDb();
  const store = makeStore(db);

  store.upsertFieldStudioMap('{"v":1}', 'hash1');
  // Pin updated_at to a known past time so we can detect if it changes
  db.prepare("UPDATE field_studio_map SET updated_at = '2020-01-01 00:00:00' WHERE id = 1").run();

  // Re-upsert identical hash (simulates compileProcessCompletion re-sync)
  store.upsertFieldStudioMap('{"v":1}', 'hash1');
  const row = store.getFieldStudioMap();

  assert.equal(row.updated_at, '2020-01-01 00:00:00',
    'updated_at must not change when map_hash is unchanged');
  db.close();
});

test('upsert with changed hash updates updated_at', () => {
  const db = createTestDb();
  const store = makeStore(db);

  store.upsertFieldStudioMap('{"v":1}', 'hash1');
  db.prepare("UPDATE field_studio_map SET updated_at = '2020-01-01 00:00:00' WHERE id = 1").run();

  // Upsert with different hash (simulates real user edit)
  store.upsertFieldStudioMap('{"v":2}', 'hash2');
  const row = store.getFieldStudioMap();

  assert.notEqual(row.updated_at, '2020-01-01 00:00:00',
    'updated_at must change when map_hash changes');
  db.close();
});

// ── getCompiledRules / getBootConfig contract + memoization ─────────────

test('getCompiledRules returns null when no row exists', () => {
  const db = createTestDb();
  const store = makeStore(db);
  assert.equal(store.getCompiledRules(), null);
  db.close();
});

test('getCompiledRules returns null when compiled_rules is default "{}" (no fields key)', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsertFieldStudioMap('{}', 'h');
  assert.equal(store.getCompiledRules(), null);
  db.close();
});

test('getCompiledRules returns null when compiled_rules is malformed JSON', () => {
  const db = createTestDb();
  const store = makeStore(db);
  db.prepare(`
    INSERT INTO field_studio_map (id, compiled_rules)
    VALUES (1, 'not-json')
  `).run();
  assert.equal(store.getCompiledRules(), null);
  db.close();
});

test('getCompiledRules parses and returns blob when fields present', () => {
  const db = createTestDb();
  const store = makeStore(db);
  const blob = JSON.stringify({ fields: { dpi: { variant_dependent: false } }, field_order: ['dpi'] });
  store.upsertCompiledRules(blob, '{}');
  const result = store.getCompiledRules();
  assert.ok(result && result.fields);
  assert.equal(result.fields.dpi.variant_dependent, false);
  db.close();
});

test('getCompiledRules memoizes — same object reference across calls when blob unchanged', () => {
  // WHY: hot-path callers (isVariantDependentField) call this inside 30k-iteration loops.
  // Re-parsing a 365 KB JSON blob each time costs ~65s. Stable reference proves the cache hit.
  const db = createTestDb();
  const store = makeStore(db);
  const blob = JSON.stringify({ fields: { dpi: {} } });
  store.upsertCompiledRules(blob, '{}');

  const first = store.getCompiledRules();
  const second = store.getCompiledRules();
  const third = store.getCompiledRules();

  assert.strictEqual(first, second, 'second call must return cached reference');
  assert.strictEqual(second, third, 'third call must return cached reference');
  db.close();
});

test('getCompiledRules invalidates cache after upsertCompiledRules with new blob', () => {
  const db = createTestDb();
  const store = makeStore(db);
  const blobA = JSON.stringify({ fields: { dpi: {} } });
  const blobB = JSON.stringify({ fields: { dpi: {}, weight: {} } });

  store.upsertCompiledRules(blobA, '{}');
  const before = store.getCompiledRules();
  assert.equal(Object.keys(before.fields).length, 1);

  store.upsertCompiledRules(blobB, '{}');
  const after = store.getCompiledRules();

  assert.notStrictEqual(before, after, 'upsert must invalidate cache');
  assert.equal(Object.keys(after.fields).length, 2);
  db.close();
});

test('getBootConfig returns null when no row exists', () => {
  const db = createTestDb();
  const store = makeStore(db);
  assert.equal(store.getBootConfig(), null);
  db.close();
});

test('getBootConfig parses and returns blob', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsertCompiledRules('{"fields":{"x":{}}}', JSON.stringify({ source_hosts: ['a.com'] }));
  const result = store.getBootConfig();
  assert.deepEqual(result.source_hosts, ['a.com']);
  db.close();
});

test('getBootConfig memoizes — same reference across calls when blob unchanged', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsertCompiledRules('{"fields":{"x":{}}}', '{"source_hosts":["a.com"]}');

  const first = store.getBootConfig();
  const second = store.getBootConfig();

  assert.strictEqual(first, second);
  db.close();
});

test('getBootConfig invalidates cache after upsertCompiledRules with new blob', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsertCompiledRules('{"fields":{"x":{}}}', '{"source_hosts":["a.com"]}');
  const before = store.getBootConfig();

  store.upsertCompiledRules('{"fields":{"x":{}}}', '{"source_hosts":["b.com"]}');
  const after = store.getBootConfig();

  assert.notStrictEqual(before, after);
  assert.deepEqual(after.source_hosts, ['b.com']);
  db.close();
});
