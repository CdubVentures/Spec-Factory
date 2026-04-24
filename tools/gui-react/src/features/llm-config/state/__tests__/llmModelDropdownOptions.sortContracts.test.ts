import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import { buildModelDropdownOptions } from '../llmModelDropdownOptions.ts';
import { makeModel, makeProvider } from './fixtures/llmModelDropdownFixtures.ts';

describe('buildModelDropdownOptions sort and label contracts', () => {
  it('sorts options by provider group (registry order), then cost ascending within group', () => {
    const cases = [
      {
        name: 'provider registry order determines group order',
        registry: [
          makeProvider({
            id: 'p2',
            name: 'Provider B',
            models: [{ ...makeModel('b-model', 'primary'), costInputPer1M: 5 }],
          }),
          makeProvider({
            id: 'p1',
            name: 'Provider A',
            models: [{ ...makeModel('a-model', 'primary'), costInputPer1M: 1 }],
          }),
        ],
        flat: [],
        expectedValues: ['p2:b-model', 'p1:a-model'],
      },
      {
        name: 'cost ascending within same provider regardless of role or context',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'P',
            models: [
              { ...makeModel('expensive', 'primary'), maxContextTokens: 128000, costInputPer1M: 10 },
              { ...makeModel('cheap', 'reasoning'), maxContextTokens: 8000, costInputPer1M: 1 },
              { ...makeModel('mid', 'embedding'), maxContextTokens: 1000000, costInputPer1M: 5 },
            ],
          }),
        ],
        flat: [],
        expectedValues: ['p1:cheap', 'p1:mid', 'p1:expensive'],
      },
      {
        name: 'flat entries sort after all provider-grouped entries',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'P',
            models: [makeModel('reg-base', 'primary')],
          }),
        ],
        flat: ['flat-base'],
        expectedValues: ['p1:reg-base', 'flat-base'],
      },
    ];

    for (const row of cases) {
      deepStrictEqual(
        buildModelDropdownOptions(row.flat, row.registry).map((entry) => entry.value),
        row.expectedValues,
        row.name,
      );
    }
  });

  it('carries registry role, metadata, and providerName onto the emitted option shape', () => {
    const result = buildModelDropdownOptions(
      [],
      [
        makeProvider({
          id: 'p1',
          name: 'DeepSeek',
          models: [
            { ...makeModel('m1', 'reasoning'), costInputPer1M: 5, maxContextTokens: 200000 },
          ],
        }),
      ],
    );

    strictEqual(result[0].role, 'reasoning');
    strictEqual(result[0].costInputPer1M, 5);
    strictEqual(result[0].maxContextTokens, 200000);
    strictEqual(result[0].providerName, 'DeepSeek');
  });

  it('labels are bare modelId regardless of provider name', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'DeepSeek',
        models: [
          { ...makeModel('deepseek-v4-flash', 'primary'), costInputPer1M: 1.25, maxContextTokens: 1048576 },
        ],
      }),
    ];
    strictEqual(buildModelDropdownOptions([], registry)[0].label, 'deepseek-v4-flash');
  });
});
