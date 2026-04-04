import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmMetrics } from '../costLedger.js';

function makeMockStorage(data = {}) {
  return {
    resolveOutputKey(...parts) {
      return `legacy/${parts.join('/')}`;
    },
    async readJsonOrNull(key) {
      return data[key] || null;
    },
    async readTextOrNull(key) {
      return data[key] || null;
    },
    async writeObject() {},
    async listKeys(prefix) {
      return Object.keys(data).filter((k) => k.startsWith(prefix));
    }
  };
}

test('buildLlmMetrics: empty ledger', async () => {
  const storage = makeMockStorage();
  const result = await buildLlmMetrics({ storage });
  assert.equal(result.total_calls, 0);
  assert.equal(result.total_cost_usd, 0);
  assert.equal(result.unique_products, 0);
  assert.ok(result.by_model);
  assert.ok(result.by_provider);
  assert.ok(result.by_run);
});

test('buildLlmMetrics: aggregates by model and provider', async () => {
  const ts = new Date().toISOString();
  const month = ts.slice(0, 7);
  const ledger = [
    JSON.stringify({ ts, provider: 'openai', model: 'gpt-4', cost_usd: 0.01, prompt_tokens: 100, completion_tokens: 50, product_id: 'p1' }),
    JSON.stringify({ ts, provider: 'openai', model: 'gpt-4', cost_usd: 0.02, prompt_tokens: 200, completion_tokens: 100, product_id: 'p2' })
  ].join('\n');
  // WHY: buildLlmMetrics reads month-sharded ledger files via readLedgerMonth
  const storage = makeMockStorage({ [`_billing/ledger/${month}.jsonl`]: ledger });
  const result = await buildLlmMetrics({ storage, period: 'month' });
  assert.equal(result.total_calls, 2);
  assert.ok(result.total_cost_usd > 0);
  assert.equal(result.by_model.length, 1);
  assert.equal(result.by_model[0].model, 'gpt-4');
  assert.equal(result.by_provider.length, 1);
  assert.equal(result.by_provider[0].provider, 'openai');
});
