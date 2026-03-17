import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { buildModelDropdownOptions } from '../llmModelDropdownOptions.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';

function makeProvider(overrides: Partial<LlmProviderEntry> & { id: string; name: string }): LlmProviderEntry {
  return {
    type: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    expanded: false,
    models: [],
    ...overrides,
  };
}

function makeModel(modelId: string, role: 'base' | 'reasoning' | 'fast' | 'embedding' = 'base') {
  return {
    id: `m-${modelId}`,
    modelId,
    role,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costCachedPer1M: 0,
    maxContextTokens: null,
    maxOutputTokens: null,
  };
}

describe('buildModelDropdownOptions', () => {
  it('empty everything returns empty result', () => {
    deepStrictEqual(buildModelDropdownOptions([], []), []);
  });

  it('empty registry + flat options returns all flat options with bare labels', () => {
    const result = buildModelDropdownOptions(
      ['gpt-4o', 'claude-sonnet-4-20250514'],
      [],
    );
    deepStrictEqual(result, [
      { value: 'gpt-4o', label: 'gpt-4o', providerId: null },
      { value: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4-20250514', providerId: null },
    ]);
  });

  it('registry-only models (no flat options) return "ProviderName / modelId" labels', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o'), makeModel('gpt-4o-mini')],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result, [
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1' },
      { value: 'gpt-4o-mini', label: 'OpenAI / gpt-4o-mini', providerId: 'p1' },
    ]);
  });

  it('role filtering with single role returns only matching roles', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Anthropic',
        models: [
          makeModel('claude-sonnet', 'base'),
          makeModel('claude-haiku', 'fast'),
          makeModel('o3', 'reasoning'),
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry, 'fast');
    deepStrictEqual(result, [
      { value: 'claude-haiku', label: 'Anthropic / claude-haiku', providerId: 'p1' },
    ]);
  });

  it('role filtering with array of roles returns union of matching roles', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Mixed',
        models: [
          makeModel('model-base', 'base'),
          makeModel('model-fast', 'fast'),
          makeModel('model-reasoning', 'reasoning'),
          makeModel('model-embed', 'embedding'),
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry, ['base', 'reasoning']);
    deepStrictEqual(result, [
      { value: 'model-base', label: 'Mixed / model-base', providerId: 'p1' },
      { value: 'model-reasoning', label: 'Mixed / model-reasoning', providerId: 'p1' },
    ]);
  });

  it('deduplication: flat option exists in registry, registry version wins', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o')],
      }),
    ];
    const result = buildModelDropdownOptions(['gpt-4o', 'other-model'], registry);
    deepStrictEqual(result, [
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1' },
      { value: 'other-model', label: 'other-model', providerId: null },
    ]);
  });

  it('multiple providers with overlapping models includes all registry entries', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider A',
        models: [makeModel('shared-model')],
      }),
      makeProvider({
        id: 'p2',
        name: 'Provider B',
        models: [makeModel('shared-model')],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result, [
      { value: 'shared-model', label: 'Provider A / shared-model', providerId: 'p1' },
      { value: 'shared-model', label: 'Provider B / shared-model', providerId: 'p2' },
    ]);
  });

  it('disabled providers are skipped entirely', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Disabled',
        enabled: false,
        models: [makeModel('gpt-4o')],
      }),
      makeProvider({
        id: 'p2',
        name: 'Enabled',
        models: [makeModel('claude-sonnet')],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result, [
      { value: 'claude-sonnet', label: 'Enabled / claude-sonnet', providerId: 'p2' },
    ]);
  });

  it('provider with empty name uses bare modelId as label', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: '',
        models: [makeModel('gpt-4o')],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result, [
      { value: 'gpt-4o', label: 'gpt-4o', providerId: 'p1' },
    ]);
  });

  it('flat options with no role filter still deduplicate against registry', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o', 'base'), makeModel('gpt-4o-mini', 'fast')],
      }),
    ];
    const result = buildModelDropdownOptions(
      ['gpt-4o', 'gpt-4o-mini', 'standalone'],
      registry,
    );
    deepStrictEqual(result, [
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1' },
      { value: 'gpt-4o-mini', label: 'OpenAI / gpt-4o-mini', providerId: 'p1' },
      { value: 'standalone', label: 'standalone', providerId: null },
    ]);
  });

  it('role filter excludes registry models but still appends unmatched flat options', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider',
        models: [makeModel('base-model', 'base'), makeModel('fast-model', 'fast')],
      }),
    ];
    const result = buildModelDropdownOptions(['flat-only'], registry, 'fast');
    deepStrictEqual(result, [
      { value: 'fast-model', label: 'Provider / fast-model', providerId: 'p1' },
      { value: 'flat-only', label: 'flat-only', providerId: null },
    ]);
  });

  it('deduplication uses registry models that pass the role filter', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider',
        models: [makeModel('shared', 'base'), makeModel('shared-fast', 'fast')],
      }),
    ];
    // Filter for 'fast' only; 'shared' is base role so excluded from registry results.
    // 'shared' in flat options should appear since no registry entry passed filter for it.
    const result = buildModelDropdownOptions(['shared', 'shared-fast'], registry, 'fast');
    deepStrictEqual(result, [
      { value: 'shared-fast', label: 'Provider / shared-fast', providerId: 'p1' },
      { value: 'shared', label: 'shared', providerId: null },
    ]);
  });
});
