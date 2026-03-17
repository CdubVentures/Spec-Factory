import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { bridgeRegistryToFlatKeys } from '../llmProviderRegistryBridge.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';

/* ------------------------------------------------------------------ */
/*  Factory                                                             */
/* ------------------------------------------------------------------ */

function makeProvider(
  overrides: Partial<LlmProviderEntry> & { id: string; name: string },
): LlmProviderEntry {
  return {
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    enabled: true,
    expanded: false,
    models: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  bridgeRegistryToFlatKeys — cost extraction                          */
/* ------------------------------------------------------------------ */

describe('bridgeRegistryToFlatKeys', () => {
  it('returns cost fields from registry model', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [{
          id: 'm1',
          modelId: 'gpt-4o',
          role: 'primary',
          costInputPer1M: 2.5,
          costOutputPer1M: 10.0,
          costCachedPer1M: 1.25,
          maxContextTokens: 128000,
          maxOutputTokens: 16384,
        }],
      }),
    ];
    const result = bridgeRegistryToFlatKeys(registry, 'gpt-4o');
    strictEqual(result !== null, true);
    strictEqual(result!.llmCostInputPer1M, 2.5);
    strictEqual(result!.llmCostOutputPer1M, 10.0);
    strictEqual(result!.llmCostCachedInputPer1M, 1.25);
  });

  it('returns null for unknown model', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [{
          id: 'm1',
          modelId: 'gpt-4o',
          role: 'primary',
          costInputPer1M: 2.5,
          costOutputPer1M: 10.0,
          costCachedPer1M: 1.25,
          maxContextTokens: 128000,
          maxOutputTokens: 16384,
        }],
      }),
    ];
    const result = bridgeRegistryToFlatKeys(registry, 'unknown-model');
    strictEqual(result, null);
  });

  it('returns null for disabled provider', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        enabled: false,
        models: [{
          id: 'm1',
          modelId: 'gpt-4o',
          role: 'primary',
          costInputPer1M: 2.5,
          costOutputPer1M: 10.0,
          costCachedPer1M: 1.25,
          maxContextTokens: 128000,
          maxOutputTokens: 16384,
        }],
      }),
    ];
    const result = bridgeRegistryToFlatKeys(registry, 'gpt-4o');
    strictEqual(result, null);
  });

  it('maps openai-compatible type to openai provider string', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        type: 'openai-compatible',
        models: [{
          id: 'm1',
          modelId: 'gpt-4o',
          role: 'primary',
          costInputPer1M: 2.5,
          costOutputPer1M: 10.0,
          costCachedPer1M: 1.25,
          maxContextTokens: 128000,
          maxOutputTokens: 16384,
        }],
      }),
    ];
    const result = bridgeRegistryToFlatKeys(registry, 'gpt-4o');
    strictEqual(result!.llmProvider, 'openai');
  });

  it('preserves anthropic type as provider string', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Anthropic',
        type: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        models: [{
          id: 'm1',
          modelId: 'claude-sonnet',
          role: 'primary',
          costInputPer1M: 3.0,
          costOutputPer1M: 15.0,
          costCachedPer1M: 1.5,
          maxContextTokens: 200000,
          maxOutputTokens: 8192,
        }],
      }),
    ];
    const result = bridgeRegistryToFlatKeys(registry, 'claude-sonnet');
    strictEqual(result!.llmProvider, 'anthropic');
    strictEqual(result!.llmBaseUrl, 'https://api.anthropic.com');
  });

  it('returns zero costs for model with zero-cost entries', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Free LLM',
        models: [{
          id: 'm1',
          modelId: 'free-model',
          role: 'primary',
          costInputPer1M: 0,
          costOutputPer1M: 0,
          costCachedPer1M: 0,
          maxContextTokens: null,
          maxOutputTokens: null,
        }],
      }),
    ];
    const result = bridgeRegistryToFlatKeys(registry, 'free-model');
    strictEqual(result!.llmCostInputPer1M, 0);
    strictEqual(result!.llmCostOutputPer1M, 0);
    strictEqual(result!.llmCostCachedInputPer1M, 0);
  });
});
