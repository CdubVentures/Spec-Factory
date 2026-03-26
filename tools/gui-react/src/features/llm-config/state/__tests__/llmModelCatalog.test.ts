import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { buildModelCatalogEntries } from '../llmModelCatalog.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';
import type { ModelPricingEntry } from '../llmModelCatalog.ts';

function makeProvider(overrides: Partial<LlmProviderEntry> & { id: string; name: string }): LlmProviderEntry {
  return {
    type: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    expanded: false,
    models: [],
    ...overrides,
  };
}

function makeModel(
  modelId: string,
  role: 'primary' | 'reasoning' | 'fast' | 'embedding' = 'primary',
  overrides: Partial<{ costInputPer1M: number; costOutputPer1M: number; costCachedPer1M: number; maxContextTokens: number | null; maxOutputTokens: number | null }> = {},
) {
  return {
    id: `m-${modelId}`,
    modelId,
    role,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costCachedPer1M: 0,
    maxContextTokens: null,
    maxOutputTokens: null,
    ...overrides,
  };
}

describe('buildModelCatalogEntries', () => {
  it('empty everything returns empty array', () => {
    deepStrictEqual(buildModelCatalogEntries({ registry: [], flatModelOptions: [] }), []);
  });

  it('single provider single model returns one entry with all fields', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Anthropic',
        models: [makeModel('claude-sonnet', 'primary', {
          costInputPer1M: 3,
          costOutputPer1M: 15,
          costCachedPer1M: 1.5,
          maxContextTokens: 200000,
          maxOutputTokens: 8192,
        })],
      }),
    ];
    const result = buildModelCatalogEntries({ registry, flatModelOptions: [] });
    deepStrictEqual(result, [{
      providerName: 'Anthropic',
      providerId: 'p1',
      modelId: 'claude-sonnet',
      role: 'primary',
      maxContextTokens: 200000,
      maxOutputTokens: 8192,
      costInputPer1M: 3,
      costOutputPer1M: 15,
      costCachedPer1M: 1.5,
    }]);
  });

  it('multiple providers merge correctly', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o', 'primary')],
      }),
      makeProvider({
        id: 'p2',
        name: 'Anthropic',
        models: [makeModel('claude-sonnet', 'primary')],
      }),
    ];
    const result = buildModelCatalogEntries({ registry, flatModelOptions: [] });
    deepStrictEqual(result.length, 2);
    deepStrictEqual(result[0].providerName, 'OpenAI');
    deepStrictEqual(result[1].providerName, 'Anthropic');
  });

  it('sorted: reasoning before base before fast', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [
          makeModel('fast-m', 'fast'),
          makeModel('base-m', 'primary'),
          makeModel('reason-m', 'reasoning'),
        ],
      }),
    ];
    const result = buildModelCatalogEntries({ registry, flatModelOptions: [] });
    deepStrictEqual(result.map((e) => e.modelId), ['reason-m', 'base-m', 'fast-m']);
  });

  it('tiebreaker: higher context tokens first', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [
          makeModel('small', 'primary', { maxContextTokens: 8000 }),
          makeModel('big', 'primary', { maxContextTokens: 128000 }),
        ],
      }),
    ];
    const result = buildModelCatalogEntries({ registry, flatModelOptions: [] });
    deepStrictEqual(result.map((e) => e.modelId), ['big', 'small']);
  });

  it('tiebreaker: lower cost first', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [
          makeModel('expensive', 'primary', { maxContextTokens: 128000, costInputPer1M: 10 }),
          makeModel('cheap', 'primary', { maxContextTokens: 128000, costInputPer1M: 1 }),
        ],
      }),
    ];
    const result = buildModelCatalogEntries({ registry, flatModelOptions: [] });
    deepStrictEqual(result.map((e) => e.modelId), ['cheap', 'expensive']);
  });

  it('null token caps sort last', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [
          makeModel('unknown', 'primary', { maxContextTokens: null }),
          makeModel('known', 'primary', { maxContextTokens: 128000 }),
        ],
      }),
    ];
    const result = buildModelCatalogEntries({ registry, flatModelOptions: [] });
    deepStrictEqual(result.map((e) => e.modelId), ['known', 'unknown']);
  });

  // ── Flat model options tests ──

  it('flat model options appear in catalog with minimal metadata', () => {
    const result = buildModelCatalogEntries({
      registry: [],
      flatModelOptions: ['gpt-4o', 'claude-sonnet'],
    });
    deepStrictEqual(result.length, 2);
    deepStrictEqual(result[0].modelId, 'gpt-4o');
    deepStrictEqual(result[0].providerId, '');
    deepStrictEqual(result[0].providerName, '');
    deepStrictEqual(result[0].role, 'primary');
    deepStrictEqual(result[0].costInputPer1M, 0);
    deepStrictEqual(result[1].modelId, 'claude-sonnet');
  });

  it('flat models enriched with model_pricing data', () => {
    const modelPricing: ModelPricingEntry[] = [
      { model: 'gpt-4o', provider: 'OpenAI', input_per_1m: 2.5, output_per_1m: 10, cached_input_per_1m: 1.25 },
    ];
    const result = buildModelCatalogEntries({
      registry: [],
      flatModelOptions: ['gpt-4o'],
      modelPricing,
    });
    deepStrictEqual(result[0].providerName, 'OpenAI');
    deepStrictEqual(result[0].costInputPer1M, 2.5);
    deepStrictEqual(result[0].costOutputPer1M, 10);
    deepStrictEqual(result[0].costCachedPer1M, 1.25);
  });

  it('flat models enriched with model_token_profiles data', () => {
    const modelTokenProfiles = [
      { model: 'gpt-4o', max_output_tokens: 16384 },
    ];
    const result = buildModelCatalogEntries({
      registry: [],
      flatModelOptions: ['gpt-4o'],
      modelTokenProfiles,
    });
    deepStrictEqual(result[0].maxOutputTokens, 16384);
  });

  it('registry models take precedence over flat models with same ID', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'MyOpenAI',
        models: [makeModel('gpt-4o', 'primary', { costInputPer1M: 99 })],
      }),
    ];
    const result = buildModelCatalogEntries({
      registry,
      flatModelOptions: ['gpt-4o'],
      modelPricing: [{ model: 'gpt-4o', input_per_1m: 2.5 }],
    });
    // Only one entry, from registry (cost=99), not flat (cost=2.5)
    deepStrictEqual(result.length, 1);
    deepStrictEqual(result[0].costInputPer1M, 99);
    deepStrictEqual(result[0].providerName, 'MyOpenAI');
  });

  it('mixed registry and flat models sorted together', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Custom',
        models: [makeModel('custom-reason', 'reasoning')],
      }),
    ];
    const modelPricing: ModelPricingEntry[] = [
      { model: 'gpt-4o', provider: 'OpenAI', input_per_1m: 2.5, output_per_1m: 10 },
    ];
    const result = buildModelCatalogEntries({
      registry,
      flatModelOptions: ['gpt-4o'],
      modelPricing,
    });
    // reasoning sorts first, then base
    deepStrictEqual(result.map((e) => e.modelId), ['custom-reason', 'gpt-4o']);
  });
});
