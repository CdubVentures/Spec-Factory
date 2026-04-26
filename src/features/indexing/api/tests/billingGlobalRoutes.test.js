import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerQueueBillingLearningRoutes } from '../queueBillingLearningRoutes.js';

function makeMockAppDb(entries = []) {
  return {
    getBillingRollup(month, category = '', filters = {}) {
      const requestedCategory = category || filters.category || '';
      const requestedModel = filters.model || '';
      const requestedReason = filters.reason || '';
      const requestedAccess = filters.access || '';
      const filtered = entries.filter((e) => {
        if (e.month !== month) return false;
        if (requestedCategory && e.category !== requestedCategory) return false;
        if (requestedModel && e.model !== requestedModel && `${e.provider}:${e.model}` !== requestedModel) return false;
        if (requestedReason && e.reason !== requestedReason) return false;
        if (requestedAccess === 'lab' && !String(e.provider || '').startsWith('lab-')) return false;
        if (requestedAccess === 'api' && String(e.provider || '').startsWith('lab-')) return false;
        return true;
      });
      const totals = { calls: filtered.length, cost_usd: 0, prompt_tokens: 0, completion_tokens: 0, cached_prompt_tokens: 0, sent_tokens: 0 };
      const by_model = {};
      const by_reason = {};
      const by_category = {};
      const by_day = {};
      const by_product = {};
      for (const e of filtered) {
        totals.cost_usd += e.cost_usd || 0;
        totals.prompt_tokens += e.prompt_tokens || 0;
        totals.completion_tokens += e.completion_tokens || 0;
        totals.cached_prompt_tokens += e.cached_prompt_tokens || 0;
        totals.sent_tokens += e.sent_tokens || 0;
        const mk = `${e.provider}:${e.model}`;
        if (!by_model[mk]) by_model[mk] = { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0, cached_prompt_tokens: 0, sent_tokens: 0 };
        by_model[mk].calls += 1; by_model[mk].cost_usd += e.cost_usd || 0;
        by_model[mk].prompt_tokens += e.prompt_tokens || 0;
        by_model[mk].completion_tokens += e.completion_tokens || 0;
        by_model[mk].cached_prompt_tokens += e.cached_prompt_tokens || 0;
        by_model[mk].sent_tokens += e.sent_tokens || 0;
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

function makeCtx(appDb, config = {}, overrides = {}) {
  return {
    jsonRes: (_res, status, data) => ({ status, data }),
    toInt: (v, d) => { const n = Number.parseInt(String(v), 10); return Number.isFinite(n) ? n : d; },
    config,
    storage: {},
    OUTPUT_ROOT: '/tmp',
    path: { join: (...args) => args.join('/') },
    getSpecDb: () => null,
    appDb,
    safeReadJson: async () => null,
    safeStat: async () => null,
    listFiles: async () => [],
    ...overrides,
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

  it('GET /billing/global/entries returns paginated entries', async () => {
    const result = await handler(['billing', 'global', 'entries'], new URLSearchParams('limit=10&offset=0'), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(Array.isArray(result.data.entries));
    assert.equal(typeof result.data.total, 'number');
    assert.equal(typeof result.data.limit, 'number');
    assert.equal(typeof result.data.offset, 'number');
  });

  it('GET /billing/global/model-costs returns each registry provider without collapsing LLM Lab into API rows', async () => {
    const costEntries = [
      { ts: '2026-04-10T12:00:00Z', month: '2026-04', day: '2026-04-10', provider: 'openai', model: 'gpt-5.5', category: 'mouse', reason: 'extract', cost_usd: 0.12, prompt_tokens: 1000, completion_tokens: 250, cached_prompt_tokens: 100, sent_tokens: 800 },
      { ts: '2026-04-10T12:10:00Z', month: '2026-04', day: '2026-04-10', provider: 'lab-openai', model: 'gpt-5.5', category: 'mouse', reason: 'extract', cost_usd: 0.08, prompt_tokens: 700, completion_tokens: 120, cached_prompt_tokens: 80, sent_tokens: 600 },
      { ts: '2026-04-10T13:00:00Z', month: '2026-04', day: '2026-04-10', provider: 'anthropic', model: 'claude-sonnet-4-6', category: 'keyboard', reason: 'health', cost_usd: 0.02, prompt_tokens: 200, completion_tokens: 100 },
    ];
    const costConfig = {
      llmPricingAsOf: '2026-04-23',
      llmPricingSources: { openai: 'https://openai.com/api/pricing/' },
      llmProviderRegistryJson: JSON.stringify([
        {
          id: 'lab-openai',
          name: 'LLM Lab OpenAI',
          type: 'openai-compatible',
          accessMode: 'lab',
          models: [
            {
              id: 'lab-oai-gpt55',
              modelId: 'gpt-5.5',
              role: 'reasoning',
              maxContextTokens: 1000000,
              maxOutputTokens: 128000,
              costInputPer1M: 6,
              costOutputPer1M: 36,
              costCachedPer1M: 0.6,
            },
            {
              id: 'lab-oai-gpt54-mini',
              modelId: 'gpt-5.4-mini',
              role: 'reasoning',
              maxContextTokens: 400000,
              maxOutputTokens: 128000,
              costInputPer1M: 0.75,
              costOutputPer1M: 4.5,
              costCachedPer1M: 0.075,
            },
          ],
        },
        {
          id: 'default-openai',
          name: 'OpenAI API',
          type: 'openai',
          accessMode: 'api',
          models: [
            {
              id: 'api-oai-gpt55',
              modelId: 'gpt-5.5',
              role: 'reasoning',
              maxContextTokens: 1000000,
              maxOutputTokens: 128000,
              costInputPer1M: 5,
              costOutputPer1M: 30,
              costCachedPer1M: 0.5,
            },
          ],
        },
        {
          id: 'default-anthropic',
          name: 'Anthropic',
          type: 'anthropic',
          accessMode: 'api',
          models: [
            {
              id: 'anthropic-sonnet46',
              modelId: 'claude-sonnet-4-6',
              role: 'reasoning',
              maxContextTokens: 1000000,
              maxOutputTokens: 64000,
              costInputPer1M: 3,
              costOutputPer1M: 15,
              costCachedPer1M: 0.3,
            },
          ],
        },
      ]),
    };
    const route = registerQueueBillingLearningRoutes(makeCtx(makeMockAppDb(costEntries), costConfig));

    const result = await route(['billing', 'global', 'model-costs'], new URLSearchParams('category=mouse'), 'GET', {}, {});

    assert.equal(result.status, 200);
    assert.equal(result.data.pricing_meta.as_of, '2026-04-23');
    assert.ok(result.data.totals.models >= 4);
    assert.equal(result.data.totals.current_cost_usd, 0.2);
    assert.equal(result.data.totals.used_models, 2);

    const labOpenai = result.data.providers.find((p) => p.id === 'lab-openai');
    assert.ok(labOpenai);
    assert.equal(labOpenai.label, 'LLM Lab OpenAI');
    assert.equal(labOpenai.kind, 'openai');
    assert.equal(labOpenai.current_cost_usd, 0.08);
    assert.deepEqual(labOpenai.models.map((m) => m.model).sort(), ['gpt-5.4-mini', 'gpt-5.5']);
    const labGpt55 = labOpenai.models.find((m) => m.model === 'gpt-5.5');
    assert.ok(labGpt55);
    assert.equal(labGpt55.provider, 'lab-openai');
    assert.equal(labGpt55.provider_label, 'LLM Lab OpenAI');
    assert.equal(labGpt55.input_per_1m, 6);
    assert.equal(labGpt55.output_per_1m, 36);
    assert.equal(labGpt55.cached_input_per_1m, 0.6);
    assert.equal(labGpt55.pricing_source, 'llm_lab');
    assert.equal(labGpt55.registry_provider_id, 'lab-openai');
    assert.equal(labGpt55.registry_provider_label, 'LLM Lab OpenAI');
    assert.equal(labGpt55.current.calls, 1);
    assert.equal(labGpt55.current.cost_usd, 0.08);
    assert.equal(labGpt55.max_context_tokens, 1000000);
    assert.equal(labGpt55.access_modes.includes('lab'), true);

    const apiOpenai = result.data.providers.find((p) => p.id === 'default-openai');
    assert.ok(apiOpenai);
    assert.equal(apiOpenai.label, 'OpenAI API');
    assert.equal(apiOpenai.kind, 'openai');
    assert.equal(apiOpenai.current_cost_usd, 0.12);
    const apiGpt55 = apiOpenai.models.find((m) => m.model === 'gpt-5.5');
    assert.ok(apiGpt55);
    assert.equal(apiGpt55.provider, 'default-openai');
    assert.equal(apiGpt55.pricing_source, 'provider_registry');
    assert.equal(apiGpt55.current.calls, 1);
    assert.equal(apiGpt55.current.cost_usd, 0.12);

    const anthropic = result.data.providers.find((p) => p.id === 'default-anthropic');
    assert.ok(anthropic);
    assert.equal(anthropic.current_cost_usd, 0);
  });

  it('GET /billing/global/model-costs ignores pricing-map-only models outside the provider registry', async () => {
    const config = {
      llmModelPricingMap: {
        'gpt-5.5': { inputPer1M: 5, outputPer1M: 30, cachedInputPer1M: 0.5 },
      },
      llmProviderRegistryJson: JSON.stringify([
        {
          id: 'lab-openai',
          name: 'LLM Lab OpenAI',
          type: 'openai-compatible',
          accessMode: 'lab',
          models: [
            {
              id: 'lab-oai-gpt54',
              modelId: 'gpt-5.4',
              role: 'reasoning',
              costInputPer1M: 2.5,
              costOutputPer1M: 15,
              costCachedPer1M: 0.25,
            },
          ],
        },
      ]),
    };
    const route = registerQueueBillingLearningRoutes(makeCtx(makeMockAppDb([]), config));

    const result = await route(['billing', 'global', 'model-costs'], new URLSearchParams(), 'GET', {}, {});

    assert.equal(result.status, 200);
    const labOpenai = result.data.providers.find((p) => p.id === 'lab-openai');
    assert.ok(labOpenai);
    assert.equal(labOpenai.models.some((m) => m.model === 'gpt-5.5'), false);
  });

  it('GET /billing/global/model-costs syncs LLM Lab registry before building the catalog', async () => {
    const config = {
      llmProviderRegistryJson: JSON.stringify([
        {
          id: 'lab-openai',
          name: 'LLM Lab OpenAI',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:5001/v1',
          accessMode: 'lab',
          models: [],
        },
      ]),
    };
    const route = registerQueueBillingLearningRoutes(makeCtx(makeMockAppDb([]), config, {
      syncLabRegistryIntoConfig: async (targetConfig) => {
        targetConfig.llmProviderRegistryJson = JSON.stringify([
          {
            id: 'lab-openai',
            name: 'LLM Lab OpenAI',
            type: 'openai-compatible',
            accessMode: 'lab',
            models: [
              {
                id: 'lab-oai-gpt55',
                modelId: 'gpt-5.5',
                role: 'reasoning',
                costInputPer1M: 5,
                costOutputPer1M: 30,
                costCachedPer1M: 0.5,
              },
            ],
          },
        ]);
      },
    }));

    const result = await route(['billing', 'global', 'model-costs'], new URLSearchParams(), 'GET', {}, {});

    assert.equal(result.status, 200);
    const labOpenai = result.data.providers.find((p) => p.id === 'lab-openai');
    assert.ok(labOpenai);
    const gpt55 = labOpenai.models.find((m) => m.model === 'gpt-5.5');
    assert.ok(gpt55);
    assert.equal(gpt55.input_per_1m, 5);
    assert.equal(gpt55.output_per_1m, 30);
    assert.equal(gpt55.cached_input_per_1m, 0.5);
    assert.equal(gpt55.pricing_source, 'llm_lab');
    assert.equal(gpt55.registry_provider_id, 'lab-openai');
  });

  it('GET /billing/global/model-costs prunes stale default API rows before building the catalog', async () => {
    const config = {
      llmProviderRegistryJson: JSON.stringify([
        {
          id: 'default-openai',
          name: 'OpenAI API',
          type: 'openai-compatible',
          accessMode: 'api',
          models: [
            {
              id: 'default-openai-gpt-5-2-pro',
              modelId: 'gpt-5.2-pro',
              role: 'reasoning',
              costInputPer1M: 21,
              costOutputPer1M: 168,
              costCachedPer1M: 2.1,
            },
          ],
        },
      ]),
    };
    const route = registerQueueBillingLearningRoutes(makeCtx(makeMockAppDb([]), config));

    const result = await route(['billing', 'global', 'model-costs'], new URLSearchParams(), 'GET', {}, {});

    assert.equal(result.status, 200);
    const openai = result.data.providers.find((p) => p.id === 'default-openai');
    assert.ok(openai);
    assert.equal(openai.models.some((model) => model.model === 'gpt-5.2-pro'), false);
    assert.ok(openai.models.find((model) => model.model === 'gpt-5.5'));
  });

  it('non-matching route returns false', async () => {
    const result = await handler(['billing', 'global', 'unknown'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result, false);
  });

  it('retired legacy endpoints (summary/daily/by-model/by-reason/by-category) no longer resolve', async () => {
    // WHY: Per Subtractive Engineering Mandate — these route branches were
    // collapsed into /billing/global/dashboard. They must no longer be served.
    for (const part of ['summary', 'daily', 'by-model', 'by-reason', 'by-category']) {
      const result = await handler(['billing', 'global', part], new URLSearchParams(), 'GET', {}, {});
      assert.equal(result, false, `legacy route /billing/global/${part} should be retired`);
    }
  });

  it('existing /billing/{category}/monthly still works', async () => {
    const result = await handler(['billing', 'mouse', 'monthly'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.ok(result.data.totals);
  });

  // ── /billing/global/dashboard — bundle endpoint ──

  it('GET /billing/global/dashboard returns all filtered + unfiltered subsections + prior_summary in one payload', async () => {
    const params = new URLSearchParams('month=2026-04&prior_month=2026-03');
    const result = await handler(['billing', 'global', 'dashboard'], params, 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.equal(result.data.month, '2026-04');
    assert.equal(result.data.prior_month, '2026-03');
    // filtered.*
    assert.ok(result.data.filtered);
    assert.ok(result.data.filtered.summary);
    assert.equal(typeof result.data.filtered.summary.models_used, 'number');
    assert.equal(typeof result.data.filtered.summary.categories_used, 'number');
    assert.ok(result.data.filtered.prior_summary);
    assert.equal(result.data.filtered.prior_summary.month, '2026-03');
    assert.ok(Array.isArray(result.data.filtered.by_model));
    assert.ok(Array.isArray(result.data.filtered.by_reason));
    assert.ok(Array.isArray(result.data.filtered.by_category));
    assert.ok(result.data.filtered.daily);
    assert.ok(Array.isArray(result.data.filtered.daily.days));
    assert.ok(Array.isArray(result.data.filtered.daily.by_day_reason));
    // unfiltered.*
    assert.ok(result.data.unfiltered);
    assert.ok(Array.isArray(result.data.unfiltered.by_model));
    assert.ok(Array.isArray(result.data.unfiltered.by_reason));
    assert.ok(Array.isArray(result.data.unfiltered.by_category));
  });

  it('GET /billing/global/dashboard propagates filters to filtered.* but NOT to unfiltered.*', async () => {
    const params = new URLSearchParams('month=2026-04&prior_month=2026-03&category=mouse');
    const result = await handler(['billing', 'global', 'dashboard'], params, 'GET', {}, {});
    assert.equal(result.status, 200);
    // filtered.by_category should only have mouse (filter applied)
    const filteredCategories = result.data.filtered.by_category.map((c) => c.key);
    assert.deepEqual(filteredCategories, ['mouse']);
    // unfiltered.by_category retains both mouse and keyboard
    const unfilteredCategories = result.data.unfiltered.by_category.map((c) => c.key).sort();
    assert.deepEqual(unfilteredCategories, ['keyboard', 'mouse']);
  });

  it('GET /billing/global/dashboard honors month and prior_month when explicitly passed', async () => {
    const params = new URLSearchParams('month=2026-04&prior_month=2026-02');
    const result = await handler(['billing', 'global', 'dashboard'], params, 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.equal(result.data.month, '2026-04');
    assert.equal(result.data.prior_month, '2026-02');
    assert.equal(result.data.filtered.summary.month, '2026-04');
    assert.equal(result.data.filtered.prior_summary.month, '2026-02');
  });

  it('GET /billing/global/dashboard threads months=N into getGlobalDaily', async () => {
    let capturedDays = null;
    const spyAppDb = {
      ...appDb,
      getGlobalDaily(opts) {
        capturedDays = opts.days;
        return { days: [], by_day_reason: [] };
      },
    };
    const route = registerQueueBillingLearningRoutes(makeCtx(spyAppDb));
    await route(['billing', 'global', 'dashboard'], new URLSearchParams('months=3'), 'GET', {}, {});
    assert.equal(capturedDays, 3 * 31);
    capturedDays = null;
    await route(['billing', 'global', 'dashboard'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(capturedDays, 1 * 31, 'default months=1');
  });

  it('GET /billing/global/dashboard with empty month yields zero totals not nulls', async () => {
    const params = new URLSearchParams('month=2025-01&prior_month=2024-12');
    const result = await handler(['billing', 'global', 'dashboard'], params, 'GET', {}, {});
    assert.equal(result.status, 200);
    assert.equal(result.data.filtered.summary.totals.calls, 0);
    assert.equal(result.data.filtered.summary.totals.cost_usd, 0);
    assert.equal(result.data.filtered.summary.models_used, 0);
    assert.equal(result.data.filtered.summary.categories_used, 0);
    assert.equal(result.data.filtered.prior_summary.totals.calls, 0);
    assert.deepEqual(result.data.filtered.by_model, []);
    assert.deepEqual(result.data.filtered.by_reason, []);
    assert.deepEqual(result.data.filtered.by_category, []);
  });

  it('GET /billing/global/dashboard returns 503 when appDb is missing', async () => {
    const route = registerQueueBillingLearningRoutes(makeCtx(null));
    const result = await route(['billing', 'global', 'dashboard'], new URLSearchParams(), 'GET', {}, {});
    assert.equal(result.status, 503);
  });

  it('GET /billing/global/dashboard skips wasted bucket queries (by_day, by_product never requested)', async () => {
    const calls = [];
    const spyAppDb = {
      ...appDb,
      getBillingRollup(month, category, filters, options = {}) {
        calls.push({ month, category, buckets: options.buckets ? Array.from(options.buckets).sort() : null });
        return appDb.getBillingRollup(month, category, filters, options);
      },
    };
    const route = registerQueueBillingLearningRoutes(makeCtx(spyAppDb));
    await route(['billing', 'global', 'dashboard'], new URLSearchParams('month=2026-04&prior_month=2026-03&category=mouse'), 'GET', {}, {});

    // 3 rollup calls: filtered, prior, unfiltered.
    assert.equal(calls.length, 3);
    // None of the calls request by_day or by_product (the wasted buckets).
    for (const c of calls) {
      assert.ok(c.buckets, 'every dashboard rollup call must pass a buckets option (no all-buckets fallback)');
      assert.ok(!c.buckets.includes('by_day'), 'dashboard never needs by_day');
      assert.ok(!c.buckets.includes('by_product'), 'dashboard never needs by_product');
    }
    // Filtered call requests by_model + by_reason + by_category.
    const filtered = calls.find((c) => c.month === '2026-04' && c.category === 'mouse');
    assert.deepEqual(filtered.buckets, ['by_category', 'by_model', 'by_reason']);
    // Prior call only needs by_model + by_category for models_used/categories_used counts.
    const prior = calls.find((c) => c.month === '2026-03');
    assert.deepEqual(prior.buckets, ['by_category', 'by_model']);
    // Unfiltered call requests the 3 chip buckets.
    const unfiltered = calls.find((c) => c.month === '2026-04' && c.category === '');
    assert.deepEqual(unfiltered.buckets, ['by_category', 'by_model', 'by_reason']);
  });
});
