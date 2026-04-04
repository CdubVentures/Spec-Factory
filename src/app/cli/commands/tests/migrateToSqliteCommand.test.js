import test from 'node:test';
import assert from 'node:assert/strict';

import { createMigrateToSqliteCommand } from '../migrateToSqliteCommand.js';

function createStorageStub({ keys = [], textByKey = {}, jsonByKey = {} } = {}) {
  return {
    async listKeys() {
      return keys;
    },
    async readTextOrNull(key) {
      return Object.prototype.hasOwnProperty.call(textByKey, key) ? textByKey[key] : null;
    },
    async readJsonOrNull(key) {
      return Object.prototype.hasOwnProperty.call(jsonByKey, key) ? jsonByKey[key] : null;
    },
  };
}

function createSpecDbStub() {
  const billingEntries = [];
  let closed = false;
  return {
    billingEntries,
    wasClosed: () => closed,
    getAllQueueProducts() {
      return [{ product_id: 'a' }, { product_id: 'b' }];
    },
    insertBillingEntry(entry) {
      billingEntries.push(entry);
    },
    counts() {
      return { queue_products: 2, billing_ledger: billingEntries.length };
    },
    close() {
      closed = true;
    },
  };
}

test('migrate-to-sqlite requires --category', async () => {
  const command = createMigrateToSqliteCommand({
    openSpecDbForCategory: async () => createSpecDbStub(),
    toPosixKey: (...parts) => parts.filter(Boolean).join('/'),
    fsNode: { readdir: async () => [], readFile: async () => '' },
    pathNode: { join: (...parts) => parts.join('/') },
    now: () => 0,
  });

  await assert.rejects(
    command({}, createStorageStub(), {}),
    /migrate-to-sqlite requires --category/
  );
});

test('migrate-to-sqlite throws when SpecDb cannot be opened', async () => {
  const command = createMigrateToSqliteCommand({
    openSpecDbForCategory: async () => null,
    toPosixKey: (...parts) => parts.filter(Boolean).join('/'),
    fsNode: { readdir: async () => [], readFile: async () => '' },
    pathNode: { join: (...parts) => parts.join('/') },
    now: () => 0,
  });

  await assert.rejects(
    command({}, createStorageStub(), { category: 'mouse' }),
    /Could not open SpecDb for category: mouse/
  );
});

test('migrate-to-sqlite phase 1 reports queue verification and closes SpecDb', async () => {
  const specDb = createSpecDbStub();
  const command = createMigrateToSqliteCommand({
    openSpecDbForCategory: async () => specDb,
    toPosixKey: (...parts) => parts.filter(Boolean).join('/'),
    fsNode: { readdir: async () => [], readFile: async () => '' },
    pathNode: { join: (...parts) => parts.join('/') },
    now: () => 0,
  });

  const result = await command({}, createStorageStub(), { category: 'mouse', phase: '1' });

  assert.equal(result.command, 'migrate-to-sqlite');
  assert.equal(result.category, 'mouse');
  assert.equal(result.phase, 1);
  assert.deepEqual(result.results.phase1_queue, { status: 'verified', rows: 2 });
  assert.equal(specDb.wasClosed(), true);
});

test('migrate-to-sqlite phase 2 imports valid ledger lines and skips malformed lines', async () => {
  const specDb = createSpecDbStub();
  const ledgerKey = 'output/_billing/2026-03-ledger.jsonl';
  const storage = createStorageStub({
    keys: [ledgerKey, 'output/_billing/readme.txt'],
    textByKey: {
      [ledgerKey]: [
        JSON.stringify({
          ts: '2026-03-04T10:00:00.000Z',
          provider: 'openai',
          model: 'gpt-test',
          product_id: 'mouse-1',
          cost_usd: 0.12,
          total_tokens: 100,
        }),
        '{bad-json',
        JSON.stringify({
          ts: '2026-03-04T11:00:00.000Z',
          provider: 'openai',
          model: 'gpt-test-2',
          productId: 'mouse-2',
          cost_usd: 0.2,
          total_tokens: 150,
        }),
      ].join('\n')
    },
  });

  const command = createMigrateToSqliteCommand({
    openSpecDbForCategory: async () => specDb,
    toPosixKey: (...parts) => parts.filter(Boolean).join('/'),
    fsNode: { readdir: async () => [], readFile: async () => '' },
    pathNode: { join: (...parts) => parts.join('/') },
    now: () => 0,
  });

  const result = await command({}, storage, { category: 'mouse', phase: '2' });

  assert.equal(result.results.phase2_billing.status, 'imported');
  assert.equal(result.results.phase2_billing.files, 1);
  assert.equal(result.results.phase2_billing.entries, 2);
  assert.equal(specDb.billingEntries.length, 2);
  assert.equal(specDb.wasClosed(), true);
});


