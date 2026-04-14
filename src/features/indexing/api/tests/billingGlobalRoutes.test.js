import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerQueueBillingLearningRoutes } from '../queueBillingLearningRoutes.js';

function makeMockAppDb(entries = []) {
  return {
    getBillingRollup(month, category = '') {
      const filtered = entries.filter((e) => e.month === month && (!category || e.category === category));
      const totals = { calls: filtered.length, cost_usd: 0, prompt_tokens: 0, completion_tokens: 0 };
      const by_model = {};
      const by_reason = {};
      const by_category = {};
      const by_day = {};
      const by_product = {};
      for (const e of filtered) {
        totals.cost_usd += e.cost_usd || 0;
        totals.prompt_tokens += e.prompt_tokens || 0;
        totals.completion_tokens += e.completion_tokens || 0;
        const mk = `${e.provider}:${e.model}`;
        if (!by_model[mk]) by_model[mk] = { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
        by_model[mk].calls += 1; by_model[mk].cost_usd += e.cost_usd || 0;
        if (!by_reason[e.reason]) by_reason[e.reason] = { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
        by_reason[e.reason].calls += 1; by_reason[e.reason].cost_usd += e.cost_usd || 0;
        if (!by_category[e.category]) by_category[e.category] = { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
        by_category[e.category].calls += 1; by_category[e.category].cost_usd += e.cost_usd || 0;
        if (!by_day[e.day]) by_day[e.day] = { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
        by_day[e.day].calls += 1;
      }
      return { month, generated_at: new Date().toISOString(), totals, by_day, by_category, by_product, by_model, by_reason };
    },
    getGlobalDaily() {
      return { days: [{ day: '2026-04-10', calls: 2, cost_usd: 0.03 }], by_day_reason: [{ day: '2026-04-10', reason: 'extract', calls: 2, cost_usd: 0.03 }] };
    },
    getGlobalEntries({ limit, offset }) {
      return { entries: entries.slice(offset, offset + limit), total: entries.length };
    },
  };
}

function makeCtx(appDb) {
  return {
    jsonRes: (_res, status, data) => ({ status, data }),
    toInt: (v, d) => { const n = Number.parseInt(String(v), 10); return Number.isFinite(n) ? n : d; },
    config: {},
    storage: {},
    OUTPUT_ROOT: '/tmp',
    path: { join: (...args) => args.join('/') },
    getSpecDb: () => null,
    appDb,
    safeReadJson: async () => null,
    safeStat: async () => null,
    listFiles: async () => [],
  };
}

const SAMPLE_ENTRIES = [
  { ts: '2026-04-10T12:00:00Z', month: '2026-04', day: '2026-04-10', provider: 'openai', model: 'gpt-5', category: 'mouse', reason: 'extract', cost_usd: 0.01, prompt_tokens: 100, completion_tokens: 50 },
  { ts: '2026-04-10T13:00:00Z', month: '2026-04', day: '2026-04-10', provider: 'anthropic', model: 'claude-sonnet-4-6', category: 'keyboard', reason: 'health', cost_usd: 0.02, prompt_tokens: 200, completion_tokens: 100 },
];

describe('billing global routes', () => {
  let handler, appDb;
  beforeEach(() => {
    appDb = makeMockAppDb(SAMPLE_ENTRIES);
    handler = registerQueueBillingLearningRoutes(makeCtx(appDb));
  });

  it('GET /billing/global/summary returns totals + counts', async () => {
    const result = await handler(['billing', 'global', 'summary'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(result.data.totals);
    assert.equal(typeof result.data.models_used, 'number');
    assert.equal(typeof result.data.categories_used, 'number');
  });

  it('GET /billing/global/daily returns days + by_day_reason', async () => {
    const result = await handler(['billing', 'global', 'daily'], new URLSearchParams('months=1'), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data.days));
    assert.ok(Array.isArray(result.data.by_day_reason));
  });

  it('GET /billing/global/by-model returns sorted array', async () => {
    const result = await handler(['billing', 'global', 'by-model'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data.models));
  });

  it('GET /billing/global/by-reason returns sorted array', async () => {
    const result = await handler(['billing', 'global', 'by-reason'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data.reasons));
  });

  it('GET /billing/global/by-category returns sorted array', async () => {
    const result = await handler(['billing', 'global', 'by-category'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data.categories));
  });

  it('GET /billing/global/entries returns paginated entries', async () => {
    const result = await handler(['billing', 'global', 'entries'], new URLSearchParams('limit=10&offset=0'), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data.entries));
    assert.equal(typeof result.data.total, 'number');
    assert.equal(typeof result.data.limit, 'number');
    assert.equal(typeof result.data.offset, 'number');
  });

  it('non-matching route returns false', async () => {
    const result = await handler(['billing', 'global', 'unknown'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result, false);
  });

  it('existing /billing/{category}/monthly still works', async () => {
    const result = await handler(['billing', 'mouse', 'monthly'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(result.data.totals);
  });
});
