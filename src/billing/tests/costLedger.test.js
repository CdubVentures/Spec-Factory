import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCostLedgerEntry,
  buildBillingReport,
  readBillingSnapshot
} from '../costLedger.js';
import { computeLlmCostUsd, normalizeUsage } from '../costRates.js';

function makeMemoryStorage() {
  const map = new Map();

  return {
    map,
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
    async writeObject(key, body) {
      map.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
    }
  };
}

function round8(value) {
  return Number.parseFloat(Number(value || 0).toFixed(8));
}

function makeMockSpecDb() {
  const entries = [];
  return {
    entries,
    insertBillingEntry(entry) { entries.push(entry); },
    getBillingRollup(month) {
      const filtered = entries.filter((e) => e.month === month);
      const totals = { cost_usd: 0, prompt_tokens: 0, completion_tokens: 0, calls: 0 };
      const by_day = {};
      const by_category = {};
      const by_product = {};
      const by_model = {};
      const by_reason = {};
      for (const e of filtered) {
        totals.cost_usd = round8(totals.cost_usd + (e.cost_usd || 0));
        totals.prompt_tokens += e.prompt_tokens || 0;
        totals.completion_tokens += e.completion_tokens || 0;
        totals.calls += 1;
        const bump = (map, key) => {
          if (!key) return;
          if (!map[key]) map[key] = { cost_usd: 0, prompt_tokens: 0, completion_tokens: 0, calls: 0 };
          map[key].cost_usd = round8(map[key].cost_usd + (e.cost_usd || 0));
          map[key].prompt_tokens += e.prompt_tokens || 0;
          map[key].completion_tokens += e.completion_tokens || 0;
          map[key].calls += 1;
        };
        bump(by_day, e.day);
        bump(by_category, e.category);
        bump(by_product, e.product_id);
        bump(by_model, `${e.provider}:${e.model}`);
        bump(by_reason, e.reason);
      }
      return { month, generated_at: new Date().toISOString(), totals, by_day, by_category, by_product, by_model, by_reason };
    },
    getBillingEntriesForMonth(month) {
      return entries.filter((e) => e.month === month);
    },
    getBillingSnapshot(month, productId) {
      const rollup = this.getBillingRollup(month);
      const product = rollup.by_product[productId] || { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
      return {
        month,
        monthly_cost_usd: rollup.totals.cost_usd,
        monthly_calls: rollup.totals.calls,
        product_cost_usd: product.cost_usd,
        product_calls: product.calls,
        monthly: rollup,
      };
    },
  };
}

test('cost ledger appends entries via SQL and rolls up month totals', async () => {
  const storage = makeMemoryStorage();
  const config = { s3OutputPrefix: 'specs/outputs' };
  const specDb = makeMockSpecDb();

  const usage1 = normalizeUsage({
    prompt_tokens: 1200,
    completion_tokens: 400
  });
  const usage2 = normalizeUsage({
    prompt_tokens: 1000,
    completion_tokens: 300
  });

  const cost1 = computeLlmCostUsd({
    usage: usage1,
    rates: {
      llmCostInputPer1M: 0.28,
      llmCostOutputPer1M: 0.42
    }
  }).costUsd;
  const cost2 = computeLlmCostUsd({
    usage: usage2,
    rates: {
      llmCostInputPer1M: 0.28,
      llmCostOutputPer1M: 0.42
    }
  }).costUsd;

  await appendCostLedgerEntry({
    storage,
    config,
    specDb,
    entry: {
      ts: '2026-02-09T01:00:00.000Z',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      category: 'mouse',
      productId: 'mouse-a',
      runId: 'run-a',
      reason: 'extract',
      prompt_tokens: usage1.promptTokens,
      completion_tokens: usage1.completionTokens,
      total_tokens: usage1.totalTokens,
      cost_usd: cost1
    }
  });
  await appendCostLedgerEntry({
    storage,
    config,
    specDb,
    entry: {
      ts: '2026-02-09T01:30:00.000Z',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      category: 'mouse',
      productId: 'mouse-a',
      runId: 'run-b',
      reason: 'plan',
      prompt_tokens: usage2.promptTokens,
      completion_tokens: usage2.completionTokens,
      total_tokens: usage2.totalTokens,
      cost_usd: cost2
    }
  });

  assert.equal(specDb.entries.length, 2, 'two entries persisted via SQL');

  const snapshot = await readBillingSnapshot({
    storage,
    month: '2026-02',
    productId: 'mouse-a',
    specDb,
  });
  assert.equal(snapshot.monthly_calls, 2);
  assert.equal(snapshot.product_calls, 2);
  assert.equal(snapshot.monthly_cost_usd > 0, true);
  assert.equal(snapshot.product_cost_usd > 0, true);

  const report = await buildBillingReport({
    storage,
    month: '2026-02',
    config,
    specDb,
  });
  assert.equal(report.totals.calls, 2);
  assert.equal(report.by_category.mouse.calls, 2);
  assert.equal(report.by_product['mouse-a'].calls, 2);
  assert.equal(report.by_reason.extract.calls, 1);
  assert.equal(report.by_reason.plan.calls, 1);
  assert.equal(typeof report.digest_key, 'string');
  assert.equal(typeof report.latest_digest_key, 'string');
  const digest = storage.map.get(report.digest_key)?.toString('utf8') || '';
  assert.equal(digest.includes('Run Totals (Newest First)'), true);
});

test('writeBillingDigest writes exactly 2 keys (no legacy duplicates)', async () => {
  const storage = makeMemoryStorage();
  const specDb = makeMockSpecDb();
  const config = { llmProvider: 'anthropic' };
  const entry = {
    ts: '2026-02-15T10:00:00Z',
    provider: 'anthropic',
    model: 'claude-3',
    category: 'mouse',
    productId: 'mouse-a',
    runId: 'run-1',
    round: 1,
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    cost_usd: 0.001,
    reason: 'extract',
  };

  await appendCostLedgerEntry({ storage, config, entry, specDb });
  const keysBefore = [...storage.map.keys()];

  const report = await buildBillingReport({
    storage,
    month: '2026-02',
    config,
    specDb,
  });

  const keysAfter = [...storage.map.keys()];
  const newKeys = keysAfter.filter((k) => !keysBefore.includes(k));

  assert.equal(newKeys.length, 2, `expected 2 new keys, got ${newKeys.length}: ${JSON.stringify(newKeys)}`);
  assert.ok(newKeys.some((k) => k === '_billing/monthly/2026-02.txt'), 'missing monthly digest key');
  assert.ok(newKeys.some((k) => k === '_billing/latest.txt'), 'missing latest digest key');

  for (const k of newKeys) {
    assert.ok(!k.startsWith('specs/outputs/'), `legacy-prefixed key should not be written: ${k}`);
  }
});
