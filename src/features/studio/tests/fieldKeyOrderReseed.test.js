import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../db/specDb.js';
import { reseedFieldKeyOrderFromJson } from '../fieldKeyOrderReseed.js';

function createHarness(t) {
  const helperRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'field-key-order-reseed-'));
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  t.after(() => {
    specDb.close();
    fs.rmSync(helperRoot, { recursive: true, force: true });
  });
  return { helperRoot, specDb };
}

function writeOrder(helperRoot, order) {
  const dir = path.join(helperRoot, 'mouse', '_control_plane');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'field_key_order.json'),
    `${JSON.stringify({ order }, null, 2)}\n`,
    'utf8',
  );
}

test('reseedFieldKeyOrderFromJson rebuilds SQL from durable field_key_order.json', (t) => {
  const { helperRoot, specDb } = createHarness(t);
  const order = ['__grp::Sensor', 'dpi', 'polling_rate', '__grp::Physical', 'weight'];
  writeOrder(helperRoot, order);

  const result = reseedFieldKeyOrderFromJson({ specDb, helperRoot });

  assert.deepEqual(result, { reseeded: true, count: order.length });
  const row = specDb.getFieldKeyOrder('mouse');
  assert.ok(row);
  assert.deepEqual(JSON.parse(row.order_json), order);
});

test('reseedFieldKeyOrderFromJson removes stale SQL order when durable JSON is empty', (t) => {
  const { helperRoot, specDb } = createHarness(t);
  specDb.setFieldKeyOrder('mouse', JSON.stringify(['stale_key']));
  writeOrder(helperRoot, []);

  const result = reseedFieldKeyOrderFromJson({ specDb, helperRoot });

  assert.deepEqual(result, { reseeded: true, count: 0 });
  assert.equal(specDb.getFieldKeyOrder('mouse'), null);
});
