import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createFinderSqlStore } from '../finderSqlStore.js';
import { generateFinderDdl } from '../finderSqlDdl.js';

const MODULE = {
  id: 'testFinder',
  tableName: 'test_finder',
  runsTableName: 'test_finder_runs',
  summaryColumns: [
    { name: 'items', type: 'TEXT', default: "'[]'" },
    { name: 'label', type: 'TEXT', default: "''" },
  ],
  summaryIndexes: [],
};

function makeDb() {
  const db = new Database(':memory:');
  const ddl = generateFinderDdl([MODULE]);
  for (const stmt of ddl) db.exec(stmt);
  return db;
}

describe('createFinderSqlStore — generic SQL store', () => {
  let db, store;

  before(() => {
    db = makeDb();
    store = createFinderSqlStore({ db, category: 'cat', module: MODULE });
  });

  after(() => db.close());

  // ── Summary CRUD ──────────────────────────────────────────────────

  it('upsert + get roundtrip', () => {
    store.upsert({
      category: 'cat', product_id: 'p1',
      items: ['a', 'b'], label: 'AB',
      latest_ran_at: '2026-04-01', run_count: 1,
    });
    const row = store.get('p1');
    assert.ok(row);
    assert.equal(row.product_id, 'p1');
    assert.equal(row.run_count, 1);
  });

  it('upsert updates existing row', () => {
    store.upsert({
      category: 'cat', product_id: 'p1',
      items: ['a', 'b', 'c'], label: 'ABC',
      latest_ran_at: '2026-05-01', run_count: 2,
    });
    const row = store.get('p1');
    assert.equal(row.run_count, 2);
  });

  it('get returns null for missing product', () => {
    assert.equal(store.get('nonexistent'), null);
  });

  it('listByCategory returns rows for category', () => {
    store.upsert({
      category: 'cat', product_id: 'p2',
      items: [], label: '',
      latest_ran_at: '', run_count: 0,
    });
    const rows = store.listByCategory('cat');
    assert.ok(rows.length >= 2);
    assert.ok(rows.some(r => r.product_id === 'p1'));
    assert.ok(rows.some(r => r.product_id === 'p2'));
  });

  it('remove deletes summary row', () => {
    store.upsert({
      category: 'cat', product_id: 'p-del',
      items: [], label: '',
      latest_ran_at: '', run_count: 0,
    });
    store.remove('p-del');
    assert.equal(store.get('p-del'), null);
  });

  // ── Runs CRUD ─────────────────────────────────────────────────────

  it('insertRun + listRuns roundtrip', () => {
    store.insertRun({
      category: 'cat', product_id: 'p1', run_number: 1,
      ran_at: '2026-04-01', model: 'gpt', fallback_used: false,
      selected: { items: ['a'] }, prompt: { system: 's' }, response: { items: ['a'] },
    });
    const runs = store.listRuns('p1');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].run_number, 1);
    assert.equal(runs[0].model, 'gpt');
    assert.deepEqual(runs[0].selected, { items: ['a'] });
  });

  it('insertRun rejects duplicate run_number instead of replacing history', () => {
    store.insertRun({
      category: 'cat', product_id: 'p-dup', run_number: 1,
      ran_at: '2026-04-01', model: 'first', fallback_used: false,
      selected: { items: ['first'] }, prompt: { system: 'first' }, response: { items: ['first'] },
    });

    assert.throws(
      () => store.insertRun({
        category: 'cat', product_id: 'p-dup', run_number: 1,
        ran_at: '2026-04-02', model: 'second', fallback_used: true,
        selected: { items: ['second'] }, prompt: { system: 'second' }, response: { items: ['second'] },
      }),
      /UNIQUE constraint failed/,
    );

    const runs = store.listRuns('p-dup');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].model, 'first');
    assert.deepEqual(runs[0].selected, { items: ['first'] });
  });

  // WHY: Global guardrail — every finder's insertRun routes through this
  // single function. If a caller omits ran_at (or passes empty string from
  // legacy JSON), the store must fall back to a real ISO timestamp instead
  // of writing '' into the audit log. Protects all existing + future finders.

  it('insertRun preserves a valid ran_at verbatim', () => {
    const ts = '2026-04-20T04:41:12.355Z';
    store.insertRun({
      category: 'cat', product_id: 'p-ts-keep', run_number: 1,
      ran_at: ts, model: 'gpt', fallback_used: false,
      selected: {}, prompt: {}, response: {},
    });
    const runs = store.listRuns('p-ts-keep');
    assert.equal(runs[0].ran_at, ts, 'valid ran_at preserved verbatim');
  });

  it('insertRun falls back to a real ISO timestamp when ran_at is missing', () => {
    const before = new Date().toISOString();
    store.insertRun({
      category: 'cat', product_id: 'p-ts-miss', run_number: 1,
      model: 'gpt', fallback_used: false,
      selected: {}, prompt: {}, response: {},
      // ran_at omitted
    });
    const after = new Date().toISOString();
    const runs = store.listRuns('p-ts-miss');
    assert.ok(runs[0].ran_at, 'ran_at populated');
    assert.notEqual(runs[0].ran_at, '', 'must not be empty string');
    assert.ok(runs[0].ran_at >= before && runs[0].ran_at <= after, 'within insert window');
  });

  it('insertRun falls back to a real ISO timestamp when ran_at is empty string', () => {
    store.insertRun({
      category: 'cat', product_id: 'p-ts-empty', run_number: 1,
      ran_at: '', model: 'gpt', fallback_used: false,
      selected: {}, prompt: {}, response: {},
    });
    const runs = store.listRuns('p-ts-empty');
    assert.notEqual(runs[0].ran_at, '', 'empty-string ran_at replaced with fallback');
    assert.ok(runs[0].ran_at.length > 0);
  });

  // WHY: First-class timing columns — all finders persist started_at +
  // duration_ms without embedding in response_json. Every insertRun passes
  // these through; missing values round-trip as null.

  it('insertRun persists started_at + duration_ms as first-class columns', () => {
    store.insertRun({
      category: 'cat', product_id: 'p-timing-keep', run_number: 1,
      ran_at: '2026-04-20T06:33:38.097Z',
      started_at: '2026-04-20T06:23:51.336Z',
      duration_ms: 586761,
      model: 'gpt', fallback_used: false,
      selected: {}, prompt: {}, response: {},
    });
    const runs = store.listRuns('p-timing-keep');
    assert.equal(runs[0].started_at, '2026-04-20T06:23:51.336Z');
    assert.equal(runs[0].duration_ms, 586761);
  });

  it('insertRun persists null started_at + duration_ms when omitted', () => {
    store.insertRun({
      category: 'cat', product_id: 'p-timing-omit', run_number: 1,
      ran_at: '2026-04-20T06:33:38.097Z',
      model: 'gpt', fallback_used: false,
      selected: {}, prompt: {}, response: {},
    });
    const runs = store.listRuns('p-timing-omit');
    assert.equal(runs[0].started_at, null);
    assert.equal(runs[0].duration_ms, null);
  });

  it('insertRun serializes JSON fields', () => {
    store.insertRun({
      category: 'cat', product_id: 'p1', run_number: 2,
      ran_at: '2026-05-01', model: 'gpt-2', fallback_used: true,
      selected: { items: ['a', 'b'] }, prompt: { system: 's2', user: 'u2' }, response: {},
    });
    const runs = store.listRuns('p1');
    assert.equal(runs.length, 2);
    assert.equal(runs[1].fallback_used, true);
    assert.deepEqual(runs[1].prompt, { system: 's2', user: 'u2' });
  });

  it('removeRun deletes specific run', () => {
    store.removeRun('p1', 1);
    const runs = store.listRuns('p1');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].run_number, 2);
  });

  it('removeAllRuns clears all runs for product', () => {
    store.insertRun({
      category: 'cat', product_id: 'p-clear', run_number: 1,
      ran_at: '', model: 'x', fallback_used: false,
      selected: {}, prompt: {}, response: {},
    });
    store.removeAllRuns('p-clear');
    assert.equal(store.listRuns('p-clear').length, 0);
  });

  // ── Effort + access_mode persistence ──────────────────────────────

  it('insertRun persists effort_level and access_mode', () => {
    store.insertRun({
      category: 'cat', product_id: 'p-effort', run_number: 1,
      ran_at: '2026-04-12', model: 'gpt-5.4-xhigh', fallback_used: false,
      effort_level: 'xhigh', access_mode: 'lab',
      selected: {}, prompt: {}, response: {},
    });
    const runs = store.listRuns('p-effort');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].effort_level, 'xhigh');
    assert.equal(runs[0].access_mode, 'lab');
  });

  it('effort_level and access_mode default to empty string when omitted', () => {
    store.insertRun({
      category: 'cat', product_id: 'p-no-effort', run_number: 1,
      ran_at: '', model: 'gpt-4o', fallback_used: false,
      selected: {}, prompt: {}, response: {},
    });
    const runs = store.listRuns('p-no-effort');
    assert.equal(runs[0].effort_level, '');
    assert.equal(runs[0].access_mode, '');
  });
});

// WHY: Scope routing — the store exposes the same getSetting/setSetting/getAllSettings
// API whether scope is 'global' or 'category'. These tests lock in that each scope
// reads/writes from the correct backing table.
describe('createFinderSqlStore — settings scope routing', () => {
  const GLOBAL_DDL = `CREATE TABLE IF NOT EXISTS finder_global_settings (
    module_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (module_id, key)
  );`;

  const GLOBAL_MODULE = {
    id: 'globalFinder',
    tableName: 'global_finder',
    runsTableName: 'global_finder_runs',
    summaryColumns: [{ name: 'items', type: 'TEXT', default: "'[]'" }],
    summaryIndexes: [],
    settingsScope: 'global',
    settingsSchema: [
      { key: 'history', type: 'bool', default: false },
      { key: 'budget', type: 'int', default: 3, min: 1, max: 10 },
    ],
  };

  const CATEGORY_MODULE = {
    id: 'categoryFinder',
    tableName: 'category_finder',
    runsTableName: 'category_finder_runs',
    summaryColumns: [{ name: 'items', type: 'TEXT', default: "'[]'" }],
    summaryIndexes: [],
    settingsScope: 'category',
    settingsSchema: [
      { key: 'history', type: 'bool', default: false },
    ],
  };

  it('scope=global writes into finder_global_settings keyed by module_id', () => {
    const db = new Database(':memory:');
    for (const stmt of generateFinderDdl([GLOBAL_MODULE])) db.exec(stmt);
    const globalDb = new Database(':memory:');
    globalDb.exec(GLOBAL_DDL);

    const store = createFinderSqlStore({ db, category: 'mouse', module: GLOBAL_MODULE, globalDb });
    store.setSetting('history', 'true');
    store.setSetting('budget', '5');

    const row = globalDb.prepare(
      'SELECT value FROM finder_global_settings WHERE module_id = ? AND key = ?'
    ).get('globalFinder', 'history');
    assert.equal(row.value, 'true');

    // Same module_id returns both keys; schema defaults fill unset ones.
    const all = store.getAllSettings();
    assert.equal(all.history, 'true');
    assert.equal(all.budget, '5');

    db.close();
    globalDb.close();
  });

  it('scope=global isolates settings by module_id across multiple finders', () => {
    const db = new Database(':memory:');
    for (const stmt of generateFinderDdl([GLOBAL_MODULE])) db.exec(stmt);
    const otherModule = { ...GLOBAL_MODULE, id: 'otherGlobal', tableName: 'other_global', runsTableName: 'other_global_runs' };
    for (const stmt of generateFinderDdl([otherModule])) db.exec(stmt);
    const globalDb = new Database(':memory:');
    globalDb.exec(GLOBAL_DDL);

    const storeA = createFinderSqlStore({ db, category: 'mouse', module: GLOBAL_MODULE, globalDb });
    const storeB = createFinderSqlStore({ db, category: 'mouse', module: otherModule, globalDb });
    storeA.setSetting('history', 'true');
    storeB.setSetting('history', 'false');

    assert.equal(storeA.getSetting('history'), 'true');
    assert.equal(storeB.getSetting('history'), 'false');

    db.close();
    globalDb.close();
  });

  it('scope=category writes into <tableName>_settings (no module_id)', () => {
    const db = new Database(':memory:');
    for (const stmt of generateFinderDdl([CATEGORY_MODULE])) db.exec(stmt);

    const store = createFinderSqlStore({ db, category: 'mouse', module: CATEGORY_MODULE });
    store.setSetting('history', 'true');

    const row = db.prepare(
      'SELECT value FROM category_finder_settings WHERE key = ?'
    ).get('history');
    assert.equal(row.value, 'true');

    // Global table must NOT exist at all for category scope.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    assert.ok(!tables.includes('finder_global_settings'));

    db.close();
  });

  it('scope=global returns schema defaults when no row exists', () => {
    const db = new Database(':memory:');
    for (const stmt of generateFinderDdl([GLOBAL_MODULE])) db.exec(stmt);
    const globalDb = new Database(':memory:');
    globalDb.exec(GLOBAL_DDL);

    const store = createFinderSqlStore({ db, category: 'mouse', module: GLOBAL_MODULE, globalDb });
    assert.equal(store.getSetting('history'), 'false');
    assert.equal(store.getSetting('budget'), '3');

    db.close();
    globalDb.close();
  });
});
