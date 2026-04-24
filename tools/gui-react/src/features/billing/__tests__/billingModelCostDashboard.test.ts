import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import {
  buildModelCostComparisonBars,
  buildModelCostDashboard,
  filterModelCostRows,
  resolveProviderDisplay,
  sortModelCostRows,
} from '../modelCostDashboard.ts';
import type { BillingModelCostsResponse } from '../billingTypes.ts';

const RESPONSE: BillingModelCostsResponse = {
  month: '2026-04',
  pricing_meta: {
    as_of: '2026-04-23',
    sources: { openai: 'https://openai.com/api/pricing/' },
  },
  totals: {
    providers: 3,
    models: 4,
    used_models: 3,
    current_cost_usd: 0.31,
    highest_output_per_1m: 36,
  },
  providers: [
    {
      id: 'default-openai',
      label: 'OpenAI API',
      kind: 'openai',
      model_count: 1,
      used_model_count: 1,
      current_cost_usd: 0.12,
      highest_output_per_1m: 30,
      models: [
        {
          model: 'gpt-5.5',
          provider: 'default-openai',
          provider_label: 'OpenAI API',
          provider_kind: 'openai',
          role: 'reasoning',
          access_modes: ['api'],
          pricing_source: 'provider_registry',
          registry_provider_id: 'default-openai',
          registry_provider_label: 'OpenAI API',
          input_per_1m: 5,
          output_per_1m: 30,
          cached_input_per_1m: 0.5,
          max_context_tokens: 1000000,
          max_output_tokens: 128000,
          current: {
            calls: 1,
            cost_usd: 0.12,
            prompt_tokens: 1000,
            completion_tokens: 250,
            cached_prompt_tokens: 100,
            sent_tokens: 800,
          },
        },
      ],
    },
    {
      id: 'lab-openai',
      label: 'LLM Lab OpenAI',
      kind: 'openai',
      model_count: 2,
      used_model_count: 1,
      current_cost_usd: 0.08,
      highest_output_per_1m: 36,
      models: [
        {
          model: 'gpt-5.5',
          provider: 'lab-openai',
          provider_label: 'LLM Lab OpenAI',
          provider_kind: 'openai',
          role: 'reasoning',
          access_modes: ['lab'],
          pricing_source: 'llm_lab',
          registry_provider_id: 'lab-openai',
          registry_provider_label: 'LLM Lab OpenAI',
          input_per_1m: 6,
          output_per_1m: 36,
          cached_input_per_1m: 0.6,
          max_context_tokens: 1000000,
          max_output_tokens: 128000,
          current: {
            calls: 1,
            cost_usd: 0.08,
            prompt_tokens: 700,
            completion_tokens: 120,
            cached_prompt_tokens: 80,
            sent_tokens: 600,
          },
        },
        {
          model: 'gpt-5.4-mini',
          provider: 'lab-openai',
          provider_label: 'LLM Lab OpenAI',
          provider_kind: 'openai',
          role: 'reasoning',
          access_modes: ['lab'],
          pricing_source: 'llm_lab',
          registry_provider_id: 'lab-openai',
          registry_provider_label: 'LLM Lab OpenAI',
          input_per_1m: 0.75,
          output_per_1m: 4.5,
          cached_input_per_1m: 0.375,
          max_context_tokens: 400000,
          max_output_tokens: 128000,
          current: {
            calls: 0,
            cost_usd: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            cached_prompt_tokens: 0,
            sent_tokens: 0,
          },
        },
      ],
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      kind: 'anthropic',
      model_count: 1,
      used_model_count: 1,
      current_cost_usd: 0.11,
      highest_output_per_1m: 15,
      models: [
        {
          model: 'claude-sonnet-4-6',
          provider: 'default-anthropic',
          provider_label: 'Anthropic',
          provider_kind: 'anthropic',
          role: 'reasoning',
          access_modes: ['api'],
          pricing_source: 'provider_registry',
          registry_provider_id: 'default-anthropic',
          registry_provider_label: 'Anthropic',
          input_per_1m: 3,
          output_per_1m: 15,
          cached_input_per_1m: 0.3,
          max_context_tokens: 1000000,
          max_output_tokens: 64000,
          current: {
            calls: 1,
            cost_usd: 0.11,
            prompt_tokens: 1200,
            completion_tokens: 300,
            cached_prompt_tokens: 0,
            sent_tokens: 1200,
          },
        },
      ],
    },
  ],
};

describe('buildModelCostDashboard', () => {
  it('flattens provider groups and derives dashboard totals without losing provider metadata', () => {
    const result = buildModelCostDashboard(RESPONSE);

    strictEqual(result.providerCards.length, 3);
    strictEqual(result.modelRows.length, 4);
    strictEqual(result.usedRows.length, 3);
    strictEqual(result.sourceCount, 1);
    strictEqual(result.providerCards[1].id, 'lab-openai');
    strictEqual(result.providerCards[1].spendSharePct > 25, true);
    strictEqual(result.modelRows[0].model, 'gpt-5.5');
    strictEqual(result.modelRows.find((row) => row.provider === 'lab-openai' && row.model === 'gpt-5.5')?.priceIntensityPct, 100);
  });

  it('returns stable empty collections when response is absent', () => {
    const result = buildModelCostDashboard(undefined);

    deepStrictEqual(result.providerCards, []);
    deepStrictEqual(result.modelRows, []);
    deepStrictEqual(result.usedRows, []);
    strictEqual(result.sourceCount, 0);
  });

  it('drops malformed blank-model rows before charting or table display', () => {
    const response: BillingModelCostsResponse = {
      ...RESPONSE,
      providers: [
        {
          ...RESPONSE.providers[0],
          models: [
            ...RESPONSE.providers[0].models,
            {
              ...RESPONSE.providers[0].models[0],
              model: '',
              current: { ...RESPONSE.providers[0].models[0].current, calls: 10, cost_usd: 10 },
            },
          ],
        },
      ],
    };

    const result = buildModelCostDashboard(response);

    strictEqual(result.modelRows.some((row) => row.model.trim() === ''), false);
    strictEqual(buildModelCostComparisonBars(result.modelRows, { metric: 'combined_rates' }).some((bar) => bar.model.trim() === ''), false);
  });
});

describe('filterModelCostRows', () => {
  it('filters by provider and used-only state', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;

    deepStrictEqual(
      filterModelCostRows(rows, { provider: 'lab-openai', usedOnly: true }).map((row) => row.model),
      ['gpt-5.5'],
    );
  });

  it('keeps all rows for all-provider all-model state', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;

    strictEqual(filterModelCostRows(rows, { provider: 'all', usedOnly: false }).length, 4);
  });
});

describe('model cost visual comparison helpers', () => {
  it('sorts rows by a selected table metric with stable model fallback', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;

    deepStrictEqual(
      sortModelCostRows(rows, { key: 'input_per_1m', direction: 'asc' }).map((row) => `${row.provider}:${row.model}`),
      ['lab-openai:gpt-5.4-mini', 'default-anthropic:claude-sonnet-4-6', 'default-openai:gpt-5.5', 'lab-openai:gpt-5.5'],
    );
  });

  it('builds ranked visual bars with quantized theme classes', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;
    const bars = buildModelCostComparisonBars(rows, { metric: 'output_per_1m', limit: 2 });

    deepStrictEqual(bars.map((bar) => `${bar.provider}:${bar.model}`), ['lab-openai:gpt-5.5', 'default-openai:gpt-5.5']);
    strictEqual(bars[0].value, 36);
    strictEqual(bars[0].bucketClass, 'sf-h-100');
    strictEqual(bars[1].bucketClass, 'sf-h-85');
  });

  it('builds combined input/output bars for side-by-side cost comparison', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;
    const bars = buildModelCostComparisonBars(rows, { metric: 'combined_rates', limit: 2 });

    deepStrictEqual(bars.map((bar) => `${bar.provider}:${bar.model}`), ['lab-openai:gpt-5.5', 'default-openai:gpt-5.5']);
    strictEqual(bars[0].value, 42);
    strictEqual(bars[0].inputBucketClass, 'sf-h-15');
    strictEqual(bars[0].outputBucketClass, 'sf-h-85');
    strictEqual(bars[1].inputBucketClass, 'sf-h-15');
    strictEqual(bars[1].outputBucketClass, 'sf-h-85');
  });
});

describe('resolveProviderDisplay', () => {
  it('maps provider identifiers to stable logo kinds and labels', () => {
    deepStrictEqual(resolveProviderDisplay('lab-openai', 'LLM Lab OpenAI'), {
      id: 'lab-openai',
      kind: 'openai',
      label: 'LLM Lab OpenAI',
    });
    deepStrictEqual(resolveProviderDisplay('gemini', ''), {
      id: 'gemini',
      kind: 'google',
      label: 'Google',
    });
    ok(resolveProviderDisplay('custom-provider', '').label.length > 0);
  });
});
