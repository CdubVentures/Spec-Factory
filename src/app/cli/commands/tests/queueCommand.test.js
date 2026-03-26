import test from 'node:test';
import assert from 'node:assert/strict';

import { createQueueCommand } from '../queueCommand.js';

function createDeps(overrides = {}) {
  return {
    slug: (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '-'),
    toPosixKey: (...parts) => parts.filter(Boolean).join('/'),
    parseCsvList: (value) => String(value || '').split(',').map((token) => token.trim()).filter(Boolean),
    parseJsonArg: (_name, _value, fallback) => fallback,
    parseQueuePriority: (value, fallback = 3) => {
      const parsed = Number.parseInt(String(value || ''), 10);
      const resolved = Number.isFinite(parsed) ? parsed : fallback;
      return Math.max(1, Math.min(5, resolved));
    },
    asBool: (value, fallback = false) => {
      if (value === undefined || value === null || value === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    },
    ingestCsvFile: async () => ({ imported: 0 }),
    upsertQueueProduct: async () => ({ product: { product_id: 'stub' } }),
    syncQueueFromInputs: async () => {},
    listQueueProducts: async () => [],
    loadQueueState: async () => ({ state: { products: {} } }),
    clearQueueByStatus: async () => ({ removed: 0 }),
    ...overrides,
  };
}

test('queue command requires a subcommand', async () => {
  const commandQueue = createQueueCommand(createDeps());
  await assert.rejects(
    commandQueue({}, {}, { category: 'mouse', _: [] }),
    /queue requires a subcommand: add\|add-batch\|list\|stats\|retry\|pause\|clear/
  );
});

test('queue list action supports sync/status/limit and returns rows', async () => {
  const syncCalls = [];
  const listCalls = [];
  const rows = [{ product_id: 'mouse-1' }, { product_id: 'mouse-2' }];
  const commandQueue = createQueueCommand(createDeps({
    syncQueueFromInputs: async (payload) => { syncCalls.push(payload); },
    listQueueProducts: async (payload) => {
      listCalls.push(payload);
      return rows;
    },
  }));

  const result = await commandQueue({}, {}, {
    category: 'mouse',
    _: ['list'],
    sync: 'true',
    status: 'pending',
    limit: '2',
  });

  assert.equal(syncCalls.length, 1);
  assert.equal(listCalls.length, 1);
  assert.equal(result.command, 'queue');
  assert.equal(result.action, 'list');
  assert.equal(result.category, 'mouse');
  assert.equal(result.status, 'pending');
  assert.equal(result.count, 2);
  assert.deepEqual(result.products, rows);
});

test('queue stats summarizes status and priority counts from loaded queue state', async () => {
  const loadCalls = [];
  const storage = { name: 'storage-stub' };
  const commandQueue = createQueueCommand(createDeps({
    loadQueueState: async (payload) => {
      loadCalls.push(payload);
      return {
        state: {
          products: {
            one: { status: 'pending', priority: 5 },
            two: { status: 'paused', priority: 2 },
            three: { status: '', priority: 'not-a-number' },
          },
        },
      };
    },
  }));

  const result = await commandQueue({}, storage, {
    category: 'mouse',
    _: ['stats'],
  });

  assert.deepEqual(loadCalls, [{ storage, category: 'mouse' }]);
  assert.deepEqual(result, {
    command: 'queue',
    action: 'stats',
    category: 'mouse',
    total_products: 3,
    status: {
      pending: 2,
      paused: 1,
    },
    priority: {
      2: 1,
      3: 1,
      5: 1,
    },
  });
});

test('queue clear requires --status', async () => {
  const commandQueue = createQueueCommand(createDeps());
  await assert.rejects(
    commandQueue({}, {}, { category: 'mouse', _: ['clear'] }),
    /queue clear requires --status <status>/
  );
});

test('queue add requires --brand/--model when s3key does not exist', async () => {
  const storage = {
    objectExists: async () => false,
    writeObject: async () => {},
  };
  const commandQueue = createQueueCommand(createDeps());

  await assert.rejects(
    commandQueue({ s3InputPrefix: 'input' }, storage, {
      category: 'mouse',
      _: ['add'],
      'product-id': 'mouse-test',
    }),
    /queue add requires an existing --s3key job or --brand\/--model to create one/
  );
});

test('queue add creates missing job payload and upserts pending queue row', async () => {
  const writes = [];
  const upserts = [];
  const storage = {
    objectExists: async () => false,
    writeObject: async (key, body, options) => {
      writes.push({ key, body: String(body), options });
    },
  };

  const commandQueue = createQueueCommand(createDeps({
    parseCsvList: () => ['https://example.com/product'],
    parseJsonArg: (_name, _value, fallback) => fallback,
    upsertQueueProduct: async (payload) => {
      upserts.push(payload);
      return { product: { product_id: payload.productId, status: payload.patch.status } };
    },
  }));

  const result = await commandQueue({ s3InputPrefix: 'input' }, storage, {
    category: 'mouse',
    _: ['add'],
    'product-id': 'mouse-test',
    brand: 'Logitech',
    model: 'MX Master',
    priority: '5',
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, 'specs/inputs/mouse/products/mouse-test.json');
  assert.equal(writes[0].options.contentType, 'application/json');
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].patch.status, 'pending');
  assert.equal(upserts[0].patch.priority, 5);
  assert.equal(result.command, 'queue');
  assert.equal(result.action, 'add');
  assert.equal(result.category, 'mouse');
  assert.deepEqual(result.product, { product_id: 'mouse-test', status: 'pending' });
});
