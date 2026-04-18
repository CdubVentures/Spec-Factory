// WHY: Verifies the suppressions CRUD on finderSqlStore — DDL creates the
// table, INSERT OR IGNORE honors uniqueness, list filters by product, and
// scope-based removal works independently by (variant_id, mode).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { generateFinderDdl } from '../finderSqlDdl.js';
import { createFinderSqlStore } from '../finderSqlStore.js';

const TEST_MODULE = {
  id: 'testFinder',
  tableName: 'test_finder',
  runsTableName: 'test_finder_runs',
  summaryColumns: [],
  settingsSchema: [],
};

function setup() {
  const db = new Database(':memory:');
  for (const stmt of generateFinderDdl([TEST_MODULE])) db.exec(stmt);
  const store = createFinderSqlStore({ db, category: 'mouse', module: TEST_MODULE });
  return { db, store };
}

describe('finderSqlStore — suppressions', () => {
  it('empty product returns empty list', () => {
    const { store } = setup();
    assert.deepEqual(store.listSuppressions('p1'), []);
  });

  it('addSuppression persists a row', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'https://x.com', kind: 'url', variant_id: 'v_black' });
    const rows = store.listSuppressions('p1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item, 'https://x.com');
    assert.equal(rows[0].kind, 'url');
    assert.equal(rows[0].variant_id, 'v_black');
    assert.equal(rows[0].mode, '');
  });

  it('UNIQUE constraint ignores duplicate adds', () => {
    const { store } = setup();
    const entry = { item: 'https://x.com', kind: 'url', variant_id: 'v_black' };
    store.addSuppression('p1', entry);
    store.addSuppression('p1', entry);
    store.addSuppression('p1', entry);
    assert.equal(store.listSuppressions('p1').length, 1);
  });

  it('same item, different kind → two separate rows', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'foo', kind: 'url' });
    store.addSuppression('p1', { item: 'foo', kind: 'query' });
    assert.equal(store.listSuppressions('p1').length, 2);
  });

  it('same item, different variant → two separate rows', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'foo', kind: 'url', variant_id: 'v_black' });
    store.addSuppression('p1', { item: 'foo', kind: 'url', variant_id: 'v_white' });
    assert.equal(store.listSuppressions('p1').length, 2);
  });

  it('same variant, different mode → two separate rows (PIF scoping)', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'foo', kind: 'url', variant_id: 'v_black', mode: 'view' });
    store.addSuppression('p1', { item: 'foo', kind: 'url', variant_id: 'v_black', mode: 'hero' });
    assert.equal(store.listSuppressions('p1').length, 2);
  });

  it('removeSuppression deletes only the exact scope match', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'foo', kind: 'url', variant_id: 'v_black', mode: 'view' });
    store.addSuppression('p1', { item: 'foo', kind: 'url', variant_id: 'v_black', mode: 'hero' });
    store.removeSuppression('p1', { item: 'foo', kind: 'url', variant_id: 'v_black', mode: 'view' });
    const rows = store.listSuppressions('p1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].mode, 'hero');
  });

  it('removeSuppressionsByScope wipes all entries matching (variant_id, mode)', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'u1', kind: 'url', variant_id: 'v_black', mode: 'view' });
    store.addSuppression('p1', { item: 'u2', kind: 'url', variant_id: 'v_black', mode: 'view' });
    store.addSuppression('p1', { item: 'u3', kind: 'url', variant_id: 'v_black', mode: 'hero' });
    store.removeSuppressionsByScope('p1', { variant_id: 'v_black', mode: 'view' });
    const remaining = store.listSuppressions('p1');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].item, 'u3');
  });

  it('removeAllSuppressionsForProduct wipes everything for that product only', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'u1', kind: 'url' });
    store.addSuppression('p1', { item: 'u2', kind: 'query' });
    store.addSuppression('p2', { item: 'u3', kind: 'url' });
    store.removeAllSuppressionsForProduct('p1');
    assert.equal(store.listSuppressions('p1').length, 0);
    assert.equal(store.listSuppressions('p2').length, 1);
  });

  it('product scoping: p1 suppressions invisible to p2', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'only-p1', kind: 'url' });
    assert.deepEqual(store.listSuppressions('p2'), []);
  });

  it('empty string defaults for variant_id/mode (CEF product-scoped case)', () => {
    const { store } = setup();
    store.addSuppression('p1', { item: 'x', kind: 'url' });
    const rows = store.listSuppressions('p1');
    assert.equal(rows[0].variant_id, '');
    assert.equal(rows[0].mode, '');
  });
});
