import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';

import { buildModelDropdownOptions } from '../llmModelDropdownOptions.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';
import { makeModel, makeProvider } from './fixtures/llmModelDropdownFixtures.ts';

describe('buildModelDropdownOptions apiKeyFilter contracts', () => {
  it('suppresses filtered providers without letting their known registry models leak back as flat options', () => {
    const cases = [
      {
        name: 'filtered providers disappear from the dropdown',
        flat: [],
        registry: [
          makeProvider({ id: 'has-key', name: 'HasKey', models: [makeModel('model-a')] }),
          makeProvider({ id: 'no-key', name: 'NoKey', models: [makeModel('model-b')] }),
        ],
        roleFilter: undefined,
        filter: (provider: LlmProviderEntry) => provider.id === 'has-key',
        expectedValues: ['model-a'],
      },
      {
        name: 'filtered registry models do not reappear via flat fallbacks',
        flat: ['reg-model', 'flat-model'],
        registry: [
          makeProvider({ id: 'no-key', name: 'NoKey', models: [makeModel('reg-model')] }),
        ],
        roleFilter: undefined,
        filter: () => false,
        expectedValues: ['flat-model'],
      },
      {
        name: 'truly unregistered flat models still append when a keyed registry provider is allowed',
        flat: ['unregistered-model'],
        registry: [
          makeProvider({ id: 'keyed', name: 'Keyed', models: [makeModel('reg-only')] }),
        ],
        roleFilter: undefined,
        filter: (provider: LlmProviderEntry) => provider.id === 'keyed',
        expectedValues: ['reg-only', 'unregistered-model'],
      },
      {
        name: 'apiKeyFilter composes with roleFilter',
        flat: [],
        registry: [
          makeProvider({
            id: 'keyed',
            name: 'Keyed',
            models: [makeModel('m-primary', 'primary'), makeModel('m-embed', 'embedding')],
          }),
          makeProvider({
            id: 'keyless',
            name: 'Keyless',
            models: [makeModel('m-embed-2', 'embedding')],
          }),
        ],
        roleFilter: 'embedding' as const,
        filter: (provider: LlmProviderEntry) => provider.id === 'keyed',
        expectedValues: ['m-embed'],
      },
    ];

    for (const row of cases) {
      deepStrictEqual(
        buildModelDropdownOptions(row.flat, row.registry, row.roleFilter, row.filter).map((entry) => entry.value),
        row.expectedValues,
        row.name,
      );
    }
  });
});
