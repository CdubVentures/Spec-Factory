import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStatusCode,
  statusIsSuccess,
  statusIsBlocked,
  buildLlmMetrics,
  buildSourceHealth,
  buildAccuracyTrend
} from '../src/publish/publishAnalytics.js';

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

test('parseStatusCode: number pass-through', () => {
  assert.equal(parseStatusCode(200), 200);
  assert.equal(parseStatusCode(404), 404);
});

test('parseStatusCode: string parsing', () => {
  assert.equal(parseStatusCode('301'), 301);
  assert.equal(parseStatusCode('abc'), null);
});

test('parseStatusCode: null/undefined', () => {
  assert.equal(parseStatusCode(null), null);
  assert.equal(parseStatusCode(undefined), null);
});

test('statusIsSuccess: 200-399 range', () => {
  assert.equal(statusIsSuccess(200), true);
  assert.equal(statusIsSuccess(301), true);
  assert.equal(statusIsSuccess(399), true);
  assert.equal(statusIsSuccess(400), false);
  assert.equal(statusIsSuccess(500), false);
});

test('statusIsSuccess: text status', () => {
  assert.equal(statusIsSuccess(null, 'ok'), true);
  assert.equal(statusIsSuccess(null, 'success'), true);
  assert.equal(statusIsSuccess(null, 'error'), false);
});

test('statusIsBlocked: 403/429', () => {
  assert.equal(statusIsBlocked(403), true);
  assert.equal(statusIsBlocked(429), true);
  assert.equal(statusIsBlocked(200), false);
  assert.equal(statusIsBlocked(500), false);
});

test('statusIsBlocked: captcha/blocked text', () => {
  assert.equal(statusIsBlocked(null, 'captcha_required'), true);
  assert.equal(statusIsBlocked(null, 'blocked_by_waf'), true);
  assert.equal(statusIsBlocked(null, 'ok'), false);
});

test('buildLlmMetrics: empty ledger', async () => {
  const storage = makeMockStorage();
  const result = await buildLlmMetrics({ storage });
  assert.equal(result.total_calls, 0);
  assert.equal(result.total_cost_usd, 0);
  assert.equal(result.unique_products, 0);
  assert.ok(result.by_model);
  assert.ok(result.by_provider);
  assert.ok(result.by_run);
  assert.ok(result.budget);
});

test('buildLlmMetrics: aggregates by model and provider', async () => {
  const ts = new Date().toISOString();
  const ledger = [
    JSON.stringify({ ts, provider: 'openai', model: 'gpt-4', cost_usd: 0.01, prompt_tokens: 100, completion_tokens: 50, product_id: 'p1' }),
    JSON.stringify({ ts, provider: 'openai', model: 'gpt-4', cost_usd: 0.02, prompt_tokens: 200, completion_tokens: 100, product_id: 'p2' })
  ].join('\n');
  const storage = makeMockStorage({ '_billing/ledger.jsonl': ledger });
  const result = await buildLlmMetrics({ storage, period: 'month' });
  assert.equal(result.total_calls, 2);
  assert.ok(result.total_cost_usd > 0);
  assert.equal(result.by_model.length, 1);
  assert.equal(result.by_model[0].model, 'gpt-4');
  assert.equal(result.by_provider.length, 1);
  assert.equal(result.by_provider[0].provider, 'openai');
});

test('buildLlmMetrics: budget exceeded', async () => {
  const ts = new Date().toISOString();
  const ledger = JSON.stringify({ ts, provider: 'p', model: 'm', cost_usd: 1000, prompt_tokens: 1, completion_tokens: 1 });
  const storage = makeMockStorage({ '_billing/ledger.jsonl': ledger });
  const result = await buildLlmMetrics({ storage, config: { llmMonthlyBudgetUsd: 10 }, period: 'month' });
  assert.equal(result.budget.exceeded, true);
});

test('buildSourceHealth: empty sources', async () => {
  const storage = makeMockStorage();
  const result = await buildSourceHealth({ storage, category: 'mouse' });
  assert.equal(result.total_sources, 0);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.alerts, []);
});

test('buildSourceHealth: aggregates source stats', async () => {
  const ts = new Date().toISOString();
  const sources = [
    JSON.stringify({ ts, host: 'example.com', status: 200, source_id: 's1' }),
    JSON.stringify({ ts, host: 'example.com', status: 403, source_id: 's1' }),
    JSON.stringify({ ts, host: 'blocked.com', status: 403 }),
    JSON.stringify({ ts, host: 'blocked.com', status: 429 }),
    JSON.stringify({ ts, host: 'blocked.com', status: 429 }),
    JSON.stringify({ ts, host: 'blocked.com', status: 429 }),
    JSON.stringify({ ts, host: 'blocked.com', status: 429 })
  ].join('\n');
  const storage = makeMockStorage({
    'final/mouse/p1/evidence/sources.jsonl': sources
  });
  const result = await buildSourceHealth({ storage, category: 'mouse', periodDays: 365 });
  assert.ok(result.total_sources >= 2);
  const blocked = result.sources.find((s) => s.host === 'blocked.com');
  assert.ok(blocked);
  assert.ok(blocked.blocked_rate > 0);
  assert.ok(result.alerts.length >= 1);
});

test('buildAccuracyTrend: empty reports', async () => {
  const storage = makeMockStorage();
  const result = await buildAccuracyTrend({ storage, category: 'mouse', field: 'weight' });
  assert.deepEqual(result.points, []);
  assert.equal(result.delta, 0);
  assert.equal(result.regression_alert, false);
});

test('buildAccuracyTrend: generates points and delta', async () => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const data = {};
  const key1 = `output/mouse/reports/accuracy_${weekAgo.toISOString().slice(0, 10)}.json`;
  const key2 = `output/mouse/reports/accuracy_${now.toISOString().slice(0, 10)}.json`;
  data[key1] = { generated_at: weekAgo.toISOString(), raw: { by_field: { weight: { accuracy: 0.8 } } } };
  data[key2] = { generated_at: now.toISOString(), raw: { by_field: { weight: { accuracy: 0.9 } } } };
  const storage = makeMockStorage(data);
  const result = await buildAccuracyTrend({ storage, category: 'mouse', field: 'weight', periodDays: 30 });
  assert.equal(result.points.length, 2);
  assert.ok(result.delta > 0);
  assert.equal(result.regression_alert, false);
});

test('buildAccuracyTrend: regression alert when delta <= -0.05', async () => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const data = {};
  const key1 = `output/mouse/reports/accuracy_${weekAgo.toISOString().slice(0, 10)}.json`;
  const key2 = `output/mouse/reports/accuracy_${now.toISOString().slice(0, 10)}.json`;
  data[key1] = { generated_at: weekAgo.toISOString(), raw: { by_field: { weight: { accuracy: 0.9 } } } };
  data[key2] = { generated_at: now.toISOString(), raw: { by_field: { weight: { accuracy: 0.8 } } } };
  const storage = makeMockStorage(data);
  const result = await buildAccuracyTrend({ storage, category: 'mouse', field: 'weight', periodDays: 30 });
  assert.ok(result.delta < 0);
  assert.equal(result.regression_alert, true);
});
