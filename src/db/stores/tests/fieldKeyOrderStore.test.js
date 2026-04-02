import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SCHEMA } from '../../specDbSchema.js';
import { applyMigrations } from '../../specDbMigrations.js';
import { createFieldKeyOrderStore } from '../fieldKeyOrderStore.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  applyMigrations(db);
  return db;
}

function makeStore(db) {
  const stmts = {
    _getFieldKeyOrder: db.prepare(
      'SELECT order_json, updated_at FROM field_key_order WHERE category = ?'
    ),
    _setFieldKeyOrder: db.prepare(`
      INSERT INTO field_key_order (category, order_json, updated_at)
      VALUES (@category, @order_json, datetime('now'))
      ON CONFLICT(category) DO UPDATE SET
        order_json = excluded.order_json,
        updated_at = datetime('now')
    `),
    _deleteFieldKeyOrder: db.prepare(
      'DELETE FROM field_key_order WHERE category = ?'
    ),
  };
  return createFieldKeyOrderStore({ stmts });
}

test('getFieldKeyOrder returns null when table is empty', () => {
  const db = createTestDb();
  const store = makeStore(db);
  assert.equal(store.getFieldKeyOrder('mouse'), null);
  db.close();
});

test('set + get round-trip returns stored order', () => {
  const db = createTestDb();
  const store = makeStore(db);
  const order = JSON.stringify(['__grp::Sensor', 'dpi', 'polling_rate', '__grp::Physical', 'weight']);

  store.setFieldKeyOrder('mouse', order);
  const row = store.getFieldKeyOrder('mouse');

  assert.equal(row.order_json, order);
  assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}/);
  db.close();
});

test('set overwrites previous row for same category', () => {
  const db = createTestDb();
  const store = makeStore(db);

  store.setFieldKeyOrder('mouse', '["a","b"]');
  store.setFieldKeyOrder('mouse', '["c","d"]');
  const row = store.getFieldKeyOrder('mouse');

  assert.equal(row.order_json, '["c","d"]');
  db.close();
});

test('deleteFieldKeyOrder removes the row', () => {
  const db = createTestDb();
  const store = makeStore(db);

  store.setFieldKeyOrder('mouse', '["a"]');
  assert.ok(store.getFieldKeyOrder('mouse'), 'row should exist before delete');

  store.deleteFieldKeyOrder('mouse');
  assert.equal(store.getFieldKeyOrder('mouse'), null, 'row should be null after delete');
  db.close();
});

test('categories are independent', () => {
  const db = createTestDb();
  const store = makeStore(db);

  store.setFieldKeyOrder('mouse', '["mouse_field"]');
  store.setFieldKeyOrder('keyboard', '["keyboard_field"]');

  assert.equal(store.getFieldKeyOrder('mouse').order_json, '["mouse_field"]');
  assert.equal(store.getFieldKeyOrder('keyboard').order_json, '["keyboard_field"]');

  store.deleteFieldKeyOrder('mouse');
  assert.equal(store.getFieldKeyOrder('mouse'), null);
  assert.ok(store.getFieldKeyOrder('keyboard'), 'keyboard row should survive mouse delete');
  db.close();
});
