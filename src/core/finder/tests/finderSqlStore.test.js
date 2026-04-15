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
