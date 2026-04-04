import test from 'node:test';
import assert from 'node:assert/strict';
import { appendCostLedgerEntry } from '../costLedger.js';

function makeMemoryStorage() {
  const map = new Map();
  const writeCalls = [];
  return {
    map,
    writeCalls,
    resolveOutputKey(...parts) {
      return ['specs/outputs', ...parts].join('/');
    },
    async readTextOrNull(key) {
      const row = map.get(key);
      return row ? row.toString('utf8') : null;
    },
    async readJsonOrNull(key) {
      const row = map.get(key);
      return row ? JSON.parse(row.toString('utf8')) : null;
    },
    async writeObject(key, body, opts) {
      writeCalls.push({ key, opts });
      map.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
    },
  };
}

function makeEntry(overrides = {}) {
  return {
    ts: '2026-03-27T10:00:00.000Z',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    category: 'mouse',
    productId: 'mouse-test',
    runId: 'run-parity-001',
    round: 0,
    prompt_tokens: 500,
    completion_tokens: 200,
    cached_prompt_tokens: 0,
    total_tokens: 700,
    cost_usd: 0.00042,
    reason: 'extract',
    host: 'example.com',
    url_count: 1,
    evidence_chars: 1200,
    estimated_usage: false,
    ...overrides,
  };
}

test('appendCostLedgerEntry writes to SQL when specDb is provided', async () => {
  const storage = makeMemoryStorage();
  const inserted = [];
  const specDb = {
    insertBillingEntry(entry) { inserted.push(entry); },
  };

  await appendCostLedgerEntry({
    storage,
    config: {},
    entry: makeEntry(),
    specDb,
  });

  assert.equal(inserted.length, 1, 'insertBillingEntry should be called once');
  const row = inserted[0];
  assert.equal(row.ts, '2026-03-27T10:00:00.000Z');
  assert.equal(row.month, '2026-03');
  assert.equal(row.day, '2026-03-27');
  assert.equal(row.provider, 'deepseek');
  assert.equal(row.model, 'deepseek-reasoner');
  assert.equal(row.category, 'mouse');
  assert.equal(row.product_id, 'mouse-test');
  assert.equal(row.run_id, 'run-parity-001');
  assert.equal(row.prompt_tokens, 500);
  assert.equal(row.completion_tokens, 200);
  assert.equal(row.cost_usd, 0.00042);
  assert.equal(row.reason, 'extract');
  assert.equal(row.estimated_usage, 0);
});

test('appendCostLedgerEntry skips NDJSON when specDb is provided', async () => {
  const storage = makeMemoryStorage();
  const specDb = {
    insertBillingEntry() {},
  };

  const result = await appendCostLedgerEntry({
    storage,
    config: {},
    entry: makeEntry(),
    specDb,
  });

  assert.equal(storage.writeCalls.length, 0, 'no storage writes when specDb is present');
  assert.ok(result.entry, 'normalized entry should still be returned');
});

test('appendCostLedgerEntry is a no-op when specDb is null (no NDJSON fallback)', async () => {
  const storage = makeMemoryStorage();

  const result = await appendCostLedgerEntry({
    storage,
    config: {},
    entry: makeEntry(),
    specDb: null,
  });

  assert.equal(storage.writeCalls.length, 0, 'no storage writes without specDb');
  assert.ok(result.entry, 'normalized entry should still be returned');
});
