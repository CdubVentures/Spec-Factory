import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { buildModelDropdownOptions, ensureValueInOptions } from '../llmModelDropdownOptions.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';
import type { DropdownModelOption } from '../llmModelDropdownOptions.ts';

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
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
      { value: 'gpt-4o-mini', label: 'OpenAI / gpt-4o-mini', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'claude-haiku', label: 'Anthropic / claude-haiku', providerId: 'p1', role: 'fast', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'model-reasoning', label: 'Mixed / model-reasoning', providerId: 'p1', role: 'reasoning', costInputPer1M: 0, maxContextTokens: null },
      { value: 'model-base', label: 'Mixed / model-base', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'shared-model', label: 'Provider A / shared-model', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
      { value: 'shared-model', label: 'Provider B / shared-model', providerId: 'p2', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'claude-sonnet', label: 'Enabled / claude-sonnet', providerId: 'p2', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'gpt-4o', label: 'gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
      { value: 'gpt-4o-mini', label: 'OpenAI / gpt-4o-mini', providerId: 'p1', role: 'fast', costInputPer1M: 0, maxContextTokens: null },
      { value: 'standalone', label: 'standalone', providerId: null },
    ]);
  });

  it('role filter excludes unregistered flat options (unknown role)', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider',
        models: [makeModel('base-model', 'primary'), makeModel('fast-model', 'fast')],
      }),
    ];
    const result = buildModelDropdownOptions(['flat-only'], registry, 'fast');
    // flat-only has unknown role — must NOT leak into a role-filtered dropdown
    deepStrictEqual(result, [
      { value: 'fast-model', label: 'Provider / fast-model', providerId: 'p1', role: 'fast', costInputPer1M: 0, maxContextTokens: null },
    ]);
  });

  it('role filter excludes flat options whose registry role does not match', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider',
        models: [makeModel('shared', 'primary'), makeModel('shared-fast', 'fast')],
      }),
    ];
    // Filter for 'fast' only; 'shared' is primary role — must NOT appear even as flat option
    const result = buildModelDropdownOptions(['shared', 'shared-fast'], registry, 'fast');
    deepStrictEqual(result, [
      { value: 'shared-fast', label: 'Provider / shared-fast', providerId: 'p1', role: 'fast', costInputPer1M: 0, maxContextTokens: null },
    ]);
  });

  it('no role filter still appends unregistered flat options', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider',
        models: [makeModel('reg-model', 'primary')],
      }),
    ];
    const result = buildModelDropdownOptions(['flat-only'], registry);
    deepStrictEqual(result, [
      { value: 'reg-model', label: 'Provider / reg-model', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
      { value: 'flat-only', label: 'flat-only', providerId: null },
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
    deepStrictEqual(result[0].label, 'DeepSeek / deepseek-chat (1M ctx, $1.25 in)');
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
    deepStrictEqual(result[0].label, 'OpenAI / gpt-4o (128K ctx, $2.50 in)');
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
    deepStrictEqual(result[0].label, 'OpenAI / gpt-4o');
  });

  // ── API key gate filter tests ──

  it('apiKeyFilter excludes models from providers that fail the filter', () => {
    const registry = [
      makeProvider({ id: 'has-key', name: 'HasKey', models: [makeModel('model-a')] }),
      makeProvider({ id: 'no-key', name: 'NoKey', models: [makeModel('model-b')] }),
    ];
    const filter = (p: LlmProviderEntry) => p.id === 'has-key';
    const result = buildModelDropdownOptions([], registry, undefined, filter);
    deepStrictEqual(result.length, 1);
    deepStrictEqual(result[0].value, 'model-a');
  });

  it('registry model filtered by apiKeyFilter does not reappear as flat option', () => {
    const registry = [
      makeProvider({ id: 'no-key', name: 'NoKey', models: [makeModel('reg-model')] }),
    ];
    const filter = () => false;
    const result = buildModelDropdownOptions(['reg-model', 'flat-model'], registry, undefined, filter);
    // reg-model is a known registry model whose provider was filtered — must NOT leak back as flat
    deepStrictEqual(result.length, 1);
    deepStrictEqual(result[0].value, 'flat-model');
  });

  it('disabled provider models do not appear as flat options', () => {
    const registry = [
      makeProvider({ id: 'off', name: 'Off', enabled: false, models: [makeModel('disabled-model')] }),
    ];
    const result = buildModelDropdownOptions(['disabled-model', 'truly-flat'], registry);
    // disabled-model belongs to a disabled registry provider — must NOT leak as flat
    deepStrictEqual(result.length, 1);
    deepStrictEqual(result[0].value, 'truly-flat');
  });

  it('truly unregistered flat model still appears when apiKeyFilter is active', () => {
    const registry = [
      makeProvider({ id: 'keyed', name: 'Keyed', models: [makeModel('reg-only')] }),
    ];
    const filter = (p: LlmProviderEntry) => p.id === 'keyed';
    const result = buildModelDropdownOptions(['unregistered-model'], registry, undefined, filter);
    // reg-only passes filter → appears as registry option
    // unregistered-model is not in any registry → still appears as flat
    deepStrictEqual(result.length, 2);
    deepStrictEqual(result[0].value, 'reg-only');
    deepStrictEqual(result[1].value, 'unregistered-model');
  });

  it('apiKeyFilter works together with role filter', () => {
    const registry = [
      makeProvider({
        id: 'keyed',
        name: 'Keyed',
        models: [makeModel('m-primary', 'primary'), makeModel('m-fast', 'fast')],
      }),
      makeProvider({
        id: 'keyless',
        name: 'Keyless',
        models: [makeModel('m-fast-2', 'fast')],
      }),
    ];
    const filter = (p: LlmProviderEntry) => p.id === 'keyed';
    const result = buildModelDropdownOptions([], registry, 'fast', filter);
    deepStrictEqual(result.length, 1);
    deepStrictEqual(result[0].value, 'm-fast');
  });

  it('apiKeyFilter=undefined preserves existing behavior (no filtering)', () => {
    const registry = [
      makeProvider({ id: 'p1', name: 'P1', models: [makeModel('m1')] }),
      makeProvider({ id: 'p2', name: 'P2', models: [makeModel('m2')] }),
    ];
    const result = buildModelDropdownOptions([], registry, undefined, undefined);
    deepStrictEqual(result.length, 2);
  });
});

describe('ensureValueInOptions', () => {
  it('empty value returns null', () => {
    const options: DropdownModelOption[] = [
      { value: 'gpt-4o', label: 'gpt-4o', providerId: null },
    ];
    strictEqual(ensureValueInOptions(options, ''), null);
  });

  it('value present in options returns null', () => {
    const options: DropdownModelOption[] = [
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1' },
    ];
    strictEqual(ensureValueInOptions(options, 'gpt-4o'), null);
  });

  it('value missing from options returns fallback option with "(not available)" label', () => {
    const options: DropdownModelOption[] = [
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1' },
    ];
    const result = ensureValueInOptions(options, 'claude-sonnet');
    deepStrictEqual(result, {
      value: 'claude-sonnet',
      label: 'claude-sonnet (not available)',
      providerId: null,
    });
  });

  it('value missing from empty options returns fallback option', () => {
    const result = ensureValueInOptions([], 'some-model');
    deepStrictEqual(result, {
      value: 'some-model',
      label: 'some-model (not available)',
      providerId: null,
    });
  });
});
