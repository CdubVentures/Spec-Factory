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
          { value: 'p1:gpt-4o', label: 'gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
          { value: 'p1:gpt-4o-mini', label: 'gpt-4o-mini', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
          { value: 'p1:gpt-4o', label: 'gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
          { value: 'p1:shared-model', label: 'shared-model', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
          { value: 'p2:shared-model', label: 'shared-model', providerId: 'p2', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
          { value: 'p1:gpt-4o', label: 'gpt-4o', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
          { value: 'p1:embed-v1', label: 'embed-v1', providerId: 'p1', role: 'embedding', costInputPer1M: 0, maxContextTokens: null },
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
          { value: 'p1:model-reasoning', label: 'model-reasoning', providerId: 'p1', role: 'reasoning', costInputPer1M: 0, maxContextTokens: null },
          { value: 'p1:model-base', label: 'model-base', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
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
          { value: 'p1:embed-model', label: 'embed-model', providerId: 'p1', role: 'embedding', costInputPer1M: 0, maxContextTokens: null },
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
          { value: 'p1:shared-embed', label: 'shared-embed', providerId: 'p1', role: 'embedding', costInputPer1M: 0, maxContextTokens: null },
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

  it('lab models carry thinking/webSearch capability flags in dropdown options', () => {
    const registry = [
      makeProvider({
        id: 'lab-openai',
        name: 'LLM Lab OpenAI',
        accessMode: 'lab' as const,
        models: [
          { ...makeModel('gpt-5'), accessMode: 'lab' as const, thinking: true, webSearch: true },
          { ...makeModel('gpt-5-minimal'), accessMode: 'lab' as const, thinking: false, webSearch: true },
        ],
      }),
      makeProvider({
        id: 'default-openai',
        name: 'OpenAI',
        models: [makeModel('gpt-5')],
      }),
    ];

    const result = buildModelDropdownOptions([], registry);
    const labGpt5 = result.find((o) => o.providerId === 'lab-openai' && o.label === 'gpt-5');
    const labMinimal = result.find((o) => o.providerId === 'lab-openai' && o.label === 'gpt-5-minimal');
    const apiGpt5 = result.find((o) => o.providerId === 'default-openai');

    deepStrictEqual(labGpt5?.thinking, true);
    deepStrictEqual(labGpt5?.webSearch, true);
    deepStrictEqual(labMinimal?.thinking, undefined, 'false capabilities omitted');
    deepStrictEqual(labMinimal?.webSearch, true);
    deepStrictEqual(apiGpt5?.thinking, undefined, 'API model has no capabilities');
    deepStrictEqual(apiGpt5?.webSearch, undefined, 'API model has no capabilities');
  });

  it('lab models carry accessMode in dropdown options', () => {
    const registry = [
      makeProvider({
        id: 'lab-gemini',
        name: 'LLM Lab Gemini',
        accessMode: 'lab' as const,
        models: [{
          ...makeModel('gemini-2.5-flash'),
          accessMode: 'lab' as const,
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
    deepStrictEqual(apiOption?.accessMode, undefined);
  });

  it('all registry providers appear regardless — apiKeyFilter is the gate', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Provider A',
        models: [makeModel('model-a')],
      }),
      makeProvider({
        id: 'p2',
        name: 'Provider B',
        models: [makeModel('model-b')],
      }),
    ];

    deepStrictEqual(
      buildModelDropdownOptions([], registry),
      [
        { value: 'p1:model-a', label: 'model-a', providerId: 'p1', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
        { value: 'p2:model-b', label: 'model-b', providerId: 'p2', role: 'primary', costInputPer1M: 0, maxContextTokens: null },
      ],
    );
  });
});
