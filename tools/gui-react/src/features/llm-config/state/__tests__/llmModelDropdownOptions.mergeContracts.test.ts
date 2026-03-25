import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';

import { buildModelDropdownOptions } from '../llmModelDropdownOptions.ts';
import { makeModel, makeProvider } from './fixtures/llmModelDropdownFixtures.ts';

describe('buildModelDropdownOptions merge contracts', () => {
  it('merges flat and registry sources across the supported source shapes', () => {
    const cases = [
      {
        name: 'empty sources stay empty',
        flat: [],
        registry: [],
        expected: [],
      },
      {
        name: 'flat-only options keep bare labels',
        flat: ['gpt-4o', 'claude-sonnet-4-20250514'],
        registry: [],
        expected: [
          { value: 'gpt-4o', label: 'gpt-4o', providerId: null },
          { value: 'claude-sonnet-4-20250514', label: 'claude-sonnet-4-20250514', providerId: null },
        ],
      },
      {
        name: 'registry-only options use provider-prefixed labels',
        flat: [],
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            models: [makeModel('gpt-4o'), makeModel('gpt-4o-mini')],
          }),
        ],
        expected: [
          { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
          { value: 'gpt-4o-mini', label: 'OpenAI / gpt-4o-mini', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
        ],
      },
      {
        name: 'registry entries win over duplicated flat options and unknown flat options still append',
        flat: ['gpt-4o', 'other-model'],
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            models: [makeModel('gpt-4o')],
          }),
        ],
        expected: [
          { value: 'gpt-4o', label: 'OpenAI / gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
          { value: 'other-model', label: 'other-model', providerId: null },
        ],
      },
      {
        name: 'overlapping providers keep both registry entries for the same model id',
        flat: [],
        registry: [
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
        ],
        expected: [
          { value: 'shared-model', label: 'Provider A / shared-model', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
          { value: 'shared-model', label: 'Provider B / shared-model', providerId: 'p2', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
        ],
      },
      {
        name: 'providerless registry labels fall back to the bare model id',
        flat: [],
        registry: [
          makeProvider({
            id: 'p1',
            name: '',
            models: [makeModel('gpt-4o')],
          }),
        ],
        expected: [
          { value: 'gpt-4o', label: 'gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
        ],
      },
    ];

    for (const row of cases) {
      deepStrictEqual(
        buildModelDropdownOptions(row.flat, row.registry),
        row.expected,
        row.name,
      );
    }
  });

  it('filters registry options by role while excluding flat options that lack matching role metadata', () => {
    const cases = [
      {
        name: 'single-role filter returns only embedding models',
        flat: [],
        registry: [
          makeProvider({
            id: 'p1',
            name: 'Anthropic',
            models: [
              makeModel('claude-sonnet', 'primary'),
              makeModel('embed-v1', 'embedding'),
              makeModel('o3', 'reasoning'),
            ],
          }),
        ],
        roleFilter: 'embedding' as const,
        expected: [
          { value: 'embed-v1', label: 'Anthropic / embed-v1', providerId: 'p1', role: 'embedding', costInputPer1M: 0, maxContextTokens: null },
        ],
      },
      {
        name: 'multi-role filter keeps the union sorted by role priority',
        flat: [],
        registry: [
          makeProvider({
            id: 'p1',
            name: 'Mixed',
            models: [
              makeModel('model-base', 'primary'),
              makeModel('model-embed', 'embedding'),
              makeModel('model-reasoning', 'reasoning'),
            ],
          }),
        ],
        roleFilter: ['primary', 'reasoning'] as const,
        expected: [
          { value: 'model-reasoning', label: 'Mixed / model-reasoning', providerId: 'p1', role: 'reasoning', costInputPer1M: 0, maxContextTokens: null },
          { value: 'model-base', label: 'Mixed / model-base', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
        ],
      },
      {
        name: 'role-filtered dropdowns reject flat-only values with unknown role',
        flat: ['flat-only'],
        registry: [
          makeProvider({
            id: 'p1',
            name: 'Provider',
            models: [makeModel('base-model', 'primary'), makeModel('embed-model', 'embedding')],
          }),
        ],
        roleFilter: 'embedding' as const,
        expected: [
          { value: 'embed-model', label: 'Provider / embed-model', providerId: 'p1', role: 'embedding', costInputPer1M: 0, maxContextTokens: null },
        ],
      },
      {
        name: 'role-filtered dropdowns reject registry models whose role does not match',
        flat: ['shared', 'shared-embed'],
        registry: [
          makeProvider({
            id: 'p1',
            name: 'Provider',
            models: [makeModel('shared', 'primary'), makeModel('shared-embed', 'embedding')],
          }),
        ],
        roleFilter: 'embedding' as const,
        expected: [
          { value: 'shared-embed', label: 'Provider / shared-embed', providerId: 'p1', role: 'embedding', costInputPer1M: 0, maxContextTokens: null },
        ],
      },
    ];

    for (const row of cases) {
      deepStrictEqual(
        buildModelDropdownOptions(row.flat, row.registry, row.roleFilter),
        row.expected,
        row.name,
      );
    }
  });

  it('lab models carry accessMode and capabilities in dropdown options', () => {
    const registry = [
      makeProvider({
        id: 'lab-gemini',
        name: 'LLM Lab Gemini',
        accessMode: 'lab' as const,
        models: [{
          ...makeModel('gemini-2.5-flash'),
          accessMode: 'lab' as const,
          capabilities: { thinking: true, web: true },
        }],
      }),
      makeProvider({
        id: 'default-gemini',
        name: 'Gemini',
        models: [makeModel('gemini-2.5-flash')],
      }),
    ];

    const result = buildModelDropdownOptions([], registry);
    const labOption = result.find((o) => o.providerId === 'lab-gemini');
    const apiOption = result.find((o) => o.providerId === 'default-gemini');

    deepStrictEqual(labOption?.accessMode, 'lab');
    deepStrictEqual(labOption?.capabilities, { thinking: true, web: true });
    deepStrictEqual(apiOption?.accessMode, undefined);
    deepStrictEqual(apiOption?.capabilities, undefined);
  });

  it('keeps disabled-provider models off both registry and flat fallback surfaces', () => {
    const registry = [
      makeProvider({
        id: 'off',
        name: 'Disabled',
        enabled: false,
        models: [makeModel('disabled-model')],
      }),
      makeProvider({
        id: 'on',
        name: 'Enabled',
        models: [makeModel('claude-sonnet')],
      }),
    ];

    deepStrictEqual(
      buildModelDropdownOptions(['disabled-model', 'truly-flat'], registry),
      [
        { value: 'claude-sonnet', label: 'Enabled / claude-sonnet', providerId: 'on', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
        { value: 'truly-flat', label: 'truly-flat', providerId: null },
      ],
    );
  });
});
