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

function makeModel(modelId: string, role: 'primary' | 'reasoning' | 'fast' | 'embedding' = 'primary') {
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
      { value: 'gpt-4o', label: '[Primary] OpenAI / gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
      { value: 'gpt-4o-mini', label: '[Primary] OpenAI / gpt-4o-mini', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
    ]);
  });

  it('role filtering with single role returns only matching roles', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Anthropic',
        models: [
          makeModel('claude-sonnet', 'primary'),
          makeModel('claude-haiku', 'fast'),
          makeModel('o3', 'reasoning'),
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry, 'fast');
    deepStrictEqual(result, [
      { value: 'claude-haiku', label: '[Fast] Anthropic / claude-haiku', providerId: 'p1', role: 'fast', costInputPer1M: 0, maxContextTokens: null },
    ]);
  });

  it('role filtering with array of roles returns union of matching roles (sorted by role priority)', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Mixed',
        models: [
          makeModel('model-base', 'primary'),
          makeModel('model-fast', 'fast'),
          makeModel('model-reasoning', 'reasoning'),
          makeModel('model-embed', 'embedding'),
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry, ['primary', 'reasoning']);
    deepStrictEqual(result, [
      { value: 'model-reasoning', label: '[Reasoning] Mixed / model-reasoning', providerId: 'p1', role: 'reasoning', costInputPer1M: 0, maxContextTokens: null },
      { value: 'model-base', label: '[Primary] Mixed / model-base', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'gpt-4o', label: '[Primary] OpenAI / gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'shared-model', label: '[Primary] Provider A / shared-model', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
      { value: 'shared-model', label: '[Primary] Provider B / shared-model', providerId: 'p2', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'claude-sonnet', label: '[Primary] Enabled / claude-sonnet', providerId: 'p2', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'gpt-4o', label: '[Primary] gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
    ]);
  });

  it('flat options with no role filter still deduplicate against registry', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o', 'primary'), makeModel('gpt-4o-mini', 'fast')],
      }),
    ];
    const result = buildModelDropdownOptions(
      ['gpt-4o', 'gpt-4o-mini', 'standalone'],
      registry,
    );
    deepStrictEqual(result, [
      { value: 'gpt-4o', label: '[Primary] OpenAI / gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
      { value: 'gpt-4o-mini', label: '[Fast] OpenAI / gpt-4o-mini', providerId: 'p1', role: 'fast', costInputPer1M: 0, maxContextTokens: null },
      { value: 'standalone', label: 'standalone', providerId: null },
    ]);
  });

  it('role filter excludes registry models but still appends unmatched flat options', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider',
        models: [makeModel('base-model', 'primary'), makeModel('fast-model', 'fast')],
      }),
    ];
    const result = buildModelDropdownOptions(['flat-only'], registry, 'fast');
    deepStrictEqual(result, [
      { value: 'fast-model', label: '[Fast] Provider / fast-model', providerId: 'p1', role: 'fast', costInputPer1M: 0, maxContextTokens: null },
      { value: 'flat-only', label: 'flat-only', providerId: null },
    ]);
  });

  it('deduplication uses registry models that pass the role filter', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider',
        models: [makeModel('shared', 'primary'), makeModel('shared-fast', 'fast')],
      }),
    ];
    // Filter for 'fast' only; 'shared' is primary role so excluded from registry results.
    // 'shared' in flat options should appear since no registry entry passed filter for it.
    const result = buildModelDropdownOptions(['shared', 'shared-fast'], registry, 'fast');
    deepStrictEqual(result, [
      { value: 'shared-fast', label: '[Fast] Provider / shared-fast', providerId: 'p1', role: 'fast', costInputPer1M: 0, maxContextTokens: null },
      { value: 'shared', label: 'shared', providerId: null },
    ]);
  });

  // ── Sort + enrichment tests ──

  it('sorts by role priority: reasoning before primary before fast', () => {
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
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result.map((o) => o.value), ['reason-m', 'base-m', 'fast-m']);
  });

  it('sorts within same role by maxContextTokens descending, nulls last', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [
          { ...makeModel('small', 'primary'), maxContextTokens: 8000 },
          { ...makeModel('big', 'primary'), maxContextTokens: 128000 },
          { ...makeModel('unknown', 'primary'), maxContextTokens: null },
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result.map((o) => o.value), ['big', 'small', 'unknown']);
  });

  it('sorts within same role and tokens by costInputPer1M ascending', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [
          { ...makeModel('expensive', 'primary'), maxContextTokens: 128000, costInputPer1M: 10 },
          { ...makeModel('cheap', 'primary'), maxContextTokens: 128000, costInputPer1M: 1 },
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result.map((o) => o.value), ['cheap', 'expensive']);
  });

  it('flat-list options sort after registry options within same role group', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('reg-base', 'primary')],
      }),
    ];
    const result = buildModelDropdownOptions(['flat-base'], registry);
    // Registry base models first, then flat options (no role info, treated as unknown priority)
    deepStrictEqual(result.map((o) => o.value), ['reg-base', 'flat-base']);
  });

  it('registry models carry role and cost metadata on output', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [
          { ...makeModel('m1', 'reasoning'), costInputPer1M: 5, maxContextTokens: 200000 },
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result[0].role, 'reasoning');
    deepStrictEqual(result[0].costInputPer1M, 5);
    deepStrictEqual(result[0].maxContextTokens, 200000);
  });

  it('enriched labels include token cap and cost for registry models', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'DeepSeek',
        models: [
          { ...makeModel('deepseek-chat', 'primary'), costInputPer1M: 1.25, maxContextTokens: 1048576 },
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result[0].label, '[Primary] DeepSeek / deepseek-chat (1M ctx, $1.25 in)');
  });

  it('enriched labels use K suffix for sub-million context tokens', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [
          { ...makeModel('gpt-4o', 'primary'), costInputPer1M: 2.50, maxContextTokens: 128000 },
        ],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result[0].label, '[Primary] OpenAI / gpt-4o (128K ctx, $2.50 in)');
  });

  it('enriched labels omit metadata when cost is 0 and tokens null', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o')],
      }),
    ];
    const result = buildModelDropdownOptions([], registry);
    deepStrictEqual(result[0].label, '[Primary] OpenAI / gpt-4o');
  });
});
