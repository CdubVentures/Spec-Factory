import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { SCHEMA } from '../../specDbSchema.js';
import { applyMigrations } from '../../specDbMigrations.js';
import { createPifVariantProgressStore } from '../pifVariantProgressStore.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  applyMigrations(db);
  return db;
}

function makeStore(db, category = 'mouse') {
  const stmts = {
    _upsertPifVariantProgress: db.prepare(`
      INSERT INTO pif_variant_progress (
        category, product_id, variant_id, variant_key,
        priority_filled, priority_total, loop_filled, loop_total,
        hero_filled, hero_target, updated_at
      ) VALUES (
        @category, @product_id, @variant_id, @variant_key,
        @priority_filled, @priority_total, @loop_filled, @loop_total,
        @hero_filled, @hero_target, datetime('now')
      )
      ON CONFLICT(category, product_id, variant_id) DO UPDATE SET
        variant_key = excluded.variant_key,
        priority_filled = excluded.priority_filled,
        priority_total = excluded.priority_total,
        loop_filled = excluded.loop_filled,
        loop_total = excluded.loop_total,
        hero_filled = excluded.hero_filled,
        hero_target = excluded.hero_target,
        updated_at = excluded.updated_at
    `),
    _listPifVariantProgressByProduct: db.prepare(
      `SELECT variant_id, variant_key,
              priority_filled, priority_total,
              loop_filled, loop_total,
              hero_filled, hero_target, updated_at
         FROM pif_variant_progress
        WHERE category = ? AND product_id = ?
        ORDER BY variant_key`
    ),
    _listPifVariantProgressByCategory: db.prepare(
      `SELECT product_id, variant_id, variant_key,
              priority_filled, priority_total,
              loop_filled, loop_total,
              hero_filled, hero_target, image_count, updated_at
         FROM pif_variant_progress
        WHERE category = ?
        ORDER BY product_id, variant_key`
    ),
    _deletePifVariantProgressByProduct: db.prepare(
      'DELETE FROM pif_variant_progress WHERE category = ? AND product_id = ?'
    ),
    _deletePifVariantProgressByVariant: db.prepare(
      'DELETE FROM pif_variant_progress WHERE category = ? AND product_id = ? AND variant_id = ?'
    ),
  };
  return createPifVariantProgressStore({ category, stmts });
}

test('listByProduct returns empty array for fresh DB', () => {
  const db = createTestDb();
  const store = makeStore(db);
  assert.deepEqual(store.listByProduct('mouse-001'), []);
  db.close();
});

test('upsert inserts a row then returns it on list', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsert({
    productId: 'mouse-001',
    variantId: 'v_abc12345',
    variantKey: 'color:black',
    priorityFilled: 2,
    priorityTotal: 3,
    loopFilled: 1,
    loopTotal: 4,
    heroFilled: 1,
    heroTarget: 1,
  });
  const rows = store.listByProduct('mouse-001');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].variant_id, 'v_abc12345');
  assert.equal(rows[0].variant_key, 'color:black');
  assert.equal(rows[0].priority_filled, 2);
  assert.equal(rows[0].priority_total, 3);
  assert.equal(rows[0].hero_filled, 1);
  assert.equal(rows[0].hero_target, 1);
  db.close();
});

test('upsert updates an existing row on conflict', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsert({
    productId: 'mouse-001',
    variantId: 'v_abc12345',
    variantKey: 'color:black',
    priorityFilled: 1,
    priorityTotal: 3,
    heroFilled: 0,
    heroTarget: 1,
  });
  store.upsert({
    productId: 'mouse-001',
    variantId: 'v_abc12345',
    variantKey: 'color:black',
    priorityFilled: 3,
    priorityTotal: 3,
    heroFilled: 1,
    heroTarget: 1,
  });
  const rows = store.listByProduct('mouse-001');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].priority_filled, 3);
  assert.equal(rows[0].hero_filled, 1);
  db.close();
});

test('listByProduct sorts by variant_key ascending', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsert({ productId: 'p', variantId: 'v_3', variantKey: 'color:red',   priorityFilled: 0, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });
  store.upsert({ productId: 'p', variantId: 'v_1', variantKey: 'color:black', priorityFilled: 0, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });
  store.upsert({ productId: 'p', variantId: 'v_2', variantKey: 'color:blue',  priorityFilled: 0, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });
  const rows = store.listByProduct('p');
  assert.deepEqual(rows.map(r => r.variant_key), ['color:black', 'color:blue', 'color:red']);
  db.close();
});

test('listByCategory returns rows across products sorted by product then variant key', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsert({ productId: 'p2', variantId: 'v_3', variantKey: 'color:red', priorityFilled: 0, priorityTotal: 3, heroFilled: 0, heroTarget: 1, imageCount: 3 });
  store.upsert({ productId: 'p1', variantId: 'v_1', variantKey: 'color:black', priorityFilled: 0, priorityTotal: 3, heroFilled: 0, heroTarget: 1, imageCount: 1 });
  store.upsert({ productId: 'p2', variantId: 'v_2', variantKey: 'color:blue', priorityFilled: 0, priorityTotal: 3, heroFilled: 0, heroTarget: 1, imageCount: 2 });

  const rows = store.listByCategory();

  assert.deepEqual(
    rows.map((row) => `${row.product_id}:${row.variant_key}:${row.image_count}`),
    ['p1:color:black:0', 'p2:color:blue:0', 'p2:color:red:0'],
  );
  db.close();
});

test('removeByProduct deletes all variants for that product', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsert({ productId: 'p1', variantId: 'v_a', variantKey: 'color:a', priorityFilled: 1, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });
  store.upsert({ productId: 'p1', variantId: 'v_b', variantKey: 'color:b', priorityFilled: 1, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });
  store.upsert({ productId: 'p2', variantId: 'v_c', variantKey: 'color:c', priorityFilled: 1, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });

  store.removeByProduct('p1');

  assert.deepEqual(store.listByProduct('p1'), []);
  assert.equal(store.listByProduct('p2').length, 1);
  db.close();
});

test('removeByVariant deletes only the targeted variant', () => {
  const db = createTestDb();
  const store = makeStore(db);
  store.upsert({ productId: 'p1', variantId: 'v_a', variantKey: 'color:a', priorityFilled: 1, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });
  store.upsert({ productId: 'p1', variantId: 'v_b', variantKey: 'color:b', priorityFilled: 1, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });

  store.removeByVariant('p1', 'v_a');

  const remaining = store.listByProduct('p1');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].variant_id, 'v_b');
  db.close();
});

test('categories are isolated', () => {
  const db = createTestDb();
  const mouseStore = makeStore(db, 'mouse');
  const keyboardStore = makeStore(db, 'keyboard');
  mouseStore.upsert({ productId: 'p1', variantId: 'v_a', variantKey: 'color:a', priorityFilled: 1, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });
  keyboardStore.upsert({ productId: 'p1', variantId: 'v_a', variantKey: 'color:a', priorityFilled: 2, priorityTotal: 3, heroFilled: 0, heroTarget: 1 });

  assert.equal(mouseStore.listByProduct('p1')[0].priority_filled, 1);
  assert.equal(keyboardStore.listByProduct('p1')[0].priority_filled, 2);
  db.close();
});
