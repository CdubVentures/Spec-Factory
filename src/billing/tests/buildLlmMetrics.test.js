import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmMetrics } from '../costLedger.js';

function makeMockAppDb(entries = []) {
  return {
    getBillingEntriesForMonth(month) {
      return entries.filter((e) => (e.month || String(e.ts || '').slice(0, 7)) === month);
    },
  };
}

test('buildLlmMetrics: empty ledger', () => {
  const result = buildLlmMetrics({ appDb: makeMockAppDb() });
  assert.equal(result.total_calls, 0);
  assert.equal(result.total_cost_usd, 0);
  assert.equal(result.unique_products, 0);
  assert.ok(result.by_model);
  assert.ok(result.by_provider);
  assert.ok(result.by_run);
});

test('buildLlmMetrics: aggregates by model and provider', () => {
  const ts = new Date().toISOString();
  const month = ts.slice(0, 7);
  const entries = [
    { ts, month, provider: 'openai', model: 'gpt-4', cost_usd: 0.01, prompt_tokens: 100, completion_tokens: 50, product_id: 'p1', productId: 'p1' },
    { ts, month, provider: 'openai', model: 'gpt-4', cost_usd: 0.02, prompt_tokens: 200, completion_tokens: 100, product_id: 'p2', productId: 'p2' },
  ];
  const result = buildLlmMetrics({ appDb: makeMockAppDb(entries), period: 'month' });
  assert.equal(result.total_calls, 2);
  assert.ok(result.total_cost_usd > 0);
  assert.equal(result.by_model.length, 1);
  assert.equal(result.by_model[0].model, 'gpt-4');
  assert.equal(result.by_provider.length, 1);
  assert.equal(result.by_provider[0].provider, 'openai');
});
