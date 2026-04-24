import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import type { DropdownModelOption } from '../llmModelDropdownOptions.ts';
import { buildModelDropdownOptions, ensureValueInOptions, resolveOptionByValue } from '../llmModelDropdownOptions.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';

describe('ensureValueInOptions contracts', () => {
  it('returns null for empty values and values already present in the option list', () => {
    const options: DropdownModelOption[] = [
      { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1' },
    ];

    strictEqual(ensureValueInOptions(options, ''), null);
    strictEqual(ensureValueInOptions(options, 'gpt-4o'), null);
  });

  it('creates a fallback option when the current value is missing from the available options', () => {
    const cases = [
      {
        options: [{ value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1' }],
        value: 'claude-sonnet',
        expected: {
          value: 'claude-sonnet',
          label: 'claude-sonnet (not available)',
          providerId: null,
        },
      },
      {
        options: [],
        value: 'some-model',
        expected: {
          value: 'some-model',
          label: 'some-model (not available)',
          providerId: null,
        },
      },
    ];

    for (const row of cases) {
      deepStrictEqual(ensureValueInOptions(row.options, row.value), row.expected);
    }
  });

  it('returns null when a bare model ID matches a composite-key option', () => {
    const options: DropdownModelOption[] = [
      { value: 'default-gemini:gemini-2.5-flash', label: 'gemini-2.5-flash', providerId: 'default-gemini' },
    ];
    strictEqual(ensureValueInOptions(options, 'gemini-2.5-flash'), null);
  });
});

describe('resolveOptionByValue contracts', () => {
  const options: DropdownModelOption[] = [
    { value: 'default-gemini:gemini-2.5-flash', label: 'gemini-2.5-flash', providerId: 'default-gemini' },
    { value: 'default-deepseek:deepseek-v4-flash', label: 'deepseek-v4-flash', providerId: 'default-deepseek' },
  ];

  it('returns undefined for empty value', () => {
    strictEqual(resolveOptionByValue(options, ''), undefined);
  });

  it('matches exact composite value', () => {
    const result = resolveOptionByValue(options, 'default-gemini:gemini-2.5-flash');
    strictEqual(result?.value, 'default-gemini:gemini-2.5-flash');
  });

  it('matches bare model ID to composite key', () => {
    const result = resolveOptionByValue(options, 'gemini-2.5-flash');
    strictEqual(result?.value, 'default-gemini:gemini-2.5-flash');
  });

  it('returns undefined when no match exists', () => {
    strictEqual(resolveOptionByValue(options, 'nonexistent-model'), undefined);
  });
});

describe('buildModelDropdownOptions ensureValues contracts', () => {
  const registry: LlmProviderEntry[] = [
    {
      id: 'prov-a', name: 'A', type: 'openai-compatible', baseUrl: '', apiKey: 'key',
      models: [
        { id: 'm1', modelId: 'flash', role: 'primary', costInputPer1M: 0, costOutputPer1M: 0, costCachedPer1M: 0, maxContextTokens: 100000, maxOutputTokens: 8000 },
        { id: 'm2', modelId: 'pro', role: 'reasoning', costInputPer1M: 0, costOutputPer1M: 0, costCachedPer1M: 0, maxContextTokens: 100000, maxOutputTokens: 8000 },
      ],
    },
  ] as LlmProviderEntry[];

  it('pins a primary-role model into reasoning options when ensureValues includes it', () => {
    const opts = buildModelDropdownOptions([], registry, 'reasoning', undefined, ['flash']);
    const ids = opts.map((o) => o.label);
    strictEqual(ids.includes('flash'), true, 'flash should be pinned into reasoning options');
    strictEqual(ids.includes('pro'), true, 'pro should be included by role filter');
  });

  it('does not duplicate a model already included by role filter', () => {
    const opts = buildModelDropdownOptions([], registry, 'reasoning', undefined, ['pro']);
    const proCount = opts.filter((o) => o.label === 'pro').length;
    strictEqual(proCount, 1, 'pro should appear exactly once');
  });

  it('without ensureValues, role filter excludes non-matching models', () => {
    const opts = buildModelDropdownOptions([], registry, 'reasoning');
    const ids = opts.map((o) => o.label);
    strictEqual(ids.includes('flash'), false, 'flash should be excluded by reasoning filter');
  });
});
