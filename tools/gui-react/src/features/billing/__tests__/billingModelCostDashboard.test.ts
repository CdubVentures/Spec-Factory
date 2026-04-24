import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import {
  buildModelCostComparisonBars,
  buildModelCostDashboard,
  filterModelCostRows,
  groupModelCostComparisonBarsByProvider,
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

    strictEqual(result.providerCards.length, 2);
    strictEqual(result.modelRows.length, 3);
    strictEqual(result.usedRows.length, 2);
    strictEqual(result.sourceCount, 1);
    deepStrictEqual(result.providerCards.map((provider) => provider.label), ['OpenAI', 'Anthropic']);
    strictEqual(result.providerCards[0].id, 'openai:openai');
    strictEqual(result.providerCards[0].model_count, 2);
    strictEqual(result.providerCards[0].used_model_count, 1);
    strictEqual(result.providerCards[0].current_cost_usd, 0.2);
    strictEqual(result.modelRows[0].model, 'gpt-5.5');
    const gpt55 = result.modelRows.find((row) => row.provider_kind === 'openai' && row.model === 'gpt-5.5');
    ok(gpt55);
    deepStrictEqual([...gpt55.access_modes].sort(), ['api', 'lab']);
    deepStrictEqual([...gpt55.source_provider_ids].sort(), ['default-openai', 'lab-openai']);
    strictEqual(gpt55.current.calls, 2);
    strictEqual(gpt55.current.cost_usd, 0.2);
    strictEqual(gpt55.input_per_1m, 5);
    strictEqual(gpt55.output_per_1m, 30);
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
      filterModelCostRows(rows, { provider: 'openai:openai', usedOnly: true }).map((row) => row.model),
      ['gpt-5.5'],
    );
  });

  it('keeps all rows for all-provider all-model state', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;

    strictEqual(filterModelCostRows(rows, { provider: 'all', usedOnly: false }).length, 3);
  });

  it('filters by combined provider family instead of API or LLM Lab route', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;

    deepStrictEqual(
      filterModelCostRows(rows, { provider: 'openai:openai', usedOnly: false }).map((row) => row.model).sort(),
      ['gpt-5.4-mini', 'gpt-5.5'],
    );
  });
});

describe('model cost visual comparison helpers', () => {
  it('sorts rows by a selected table metric with stable model fallback', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;

    deepStrictEqual(
      sortModelCostRows(rows, { key: 'input_per_1m', direction: 'asc' }).map((row) => `${row.provider}:${row.model}`),
      ['lab-openai:gpt-5.4-mini', 'default-anthropic:claude-sonnet-4-6', 'default-openai:gpt-5.5'],
    );
  });

  it('builds ranked visual bars with quantized theme classes', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;
    const bars = buildModelCostComparisonBars(rows, { metric: 'output_per_1m', limit: 2 });

    deepStrictEqual(bars.map((bar) => `${bar.provider}:${bar.model}`), ['default-openai:gpt-5.5', 'default-anthropic:claude-sonnet-4-6']);
    strictEqual(bars[0].value, 30);
    strictEqual(bars[0].bucketClass, 'sf-h-100');
    strictEqual(bars[1].bucketClass, 'sf-h-50');
  });

  it('builds combined input/output bars scaled to one absolute cost axis', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;
    const bars = buildModelCostComparisonBars(rows, { metric: 'combined_rates', limit: 2 });

    deepStrictEqual(bars.map((bar) => `${bar.provider}:${bar.model}`), ['default-openai:gpt-5.5', 'default-anthropic:claude-sonnet-4-6']);
    strictEqual(bars[0].value, 35);
    strictEqual(bars[0].inputBucketClass, 'sf-h-15');
    strictEqual(bars[0].outputBucketClass, 'sf-h-100');
    strictEqual(bars[1].inputBucketClass, 'sf-h-10');
    strictEqual(bars[1].outputBucketClass, 'sf-h-50');
  });

  it('does not duplicate API and LLM Lab transport rows for the same model', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;
    const bars = buildModelCostComparisonBars(rows, { metric: 'combined_rates' });
    const gpt55Bars = bars.filter((bar) => bar.providerKind === 'openai' && bar.model === 'gpt-5.5');

    strictEqual(gpt55Bars.length, 1);
    deepStrictEqual([...gpt55Bars[0].row.access_modes].sort(), ['api', 'lab']);
    strictEqual(gpt55Bars[0].row.current.calls, 2);
    strictEqual('accessKind' in gpt55Bars[0], false);
  });

  it('groups chart bars by provider using the active sorted bar order', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;
    const bars = buildModelCostComparisonBars(rows, { metric: 'output_per_1m' });
    const groups = groupModelCostComparisonBarsByProvider(bars);

    deepStrictEqual(groups.map((group) => group.label), ['OpenAI', 'Anthropic']);
    deepStrictEqual(groups[0].bars.map((bar) => bar.model), ['gpt-5.5', 'gpt-5.4-mini']);
    deepStrictEqual(groups[1].bars.map((bar) => bar.model), ['claude-sonnet-4-6']);
  });

  it('sorts combined bars by an explicit axis and direction', () => {
    const rows = buildModelCostDashboard(RESPONSE).modelRows;
    const highInput = buildModelCostComparisonBars(rows, {
      metric: 'combined_rates',
      sortBy: 'input_per_1m',
      direction: 'desc',
    });
    const lowOutput = buildModelCostComparisonBars(rows, {
      metric: 'combined_rates',
      sortBy: 'output_per_1m',
      direction: 'asc',
    });

    deepStrictEqual(
      highInput.slice(0, 2).map((bar) => `${bar.provider}:${bar.model}`),
      ['default-openai:gpt-5.5', 'default-anthropic:claude-sonnet-4-6'],
    );
    deepStrictEqual(
      lowOutput.slice(0, 2).map((bar) => `${bar.provider}:${bar.model}`),
      ['lab-openai:gpt-5.4-mini', 'default-anthropic:claude-sonnet-4-6'],
    );
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
