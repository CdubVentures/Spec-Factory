import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import { buildModelDropdownOptions } from '../llmModelDropdownOptions.ts';
import { makeModel, makeProvider } from './fixtures/llmModelDropdownFixtures.ts';

describe('buildModelDropdownOptions sort and label contracts', () => {
  it('sorts options by role, then context window, then input cost, with flat options after registry entries', () => {
    const cases = [
      {
        name: 'role priority wins first',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'P',
            models: [
              makeModel('embed-m', 'embedding'),
              makeModel('base-m', 'primary'),
              makeModel('reason-m', 'reasoning'),
            ],
          }),
        ],
        flat: [],
        expectedValues: ['p1:reason-m', 'p1:base-m', 'p1:embed-m'],
      },
      {
        name: 'larger context windows sort ahead of smaller and null windows',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'P',
            models: [
              { ...makeModel('small', 'primary'), maxContextTokens: 8000 },
              { ...makeModel('big', 'primary'), maxContextTokens: 128000 },
              { ...makeModel('unknown', 'primary'), maxContextTokens: null },
            ],
          }),
        ],
        flat: [],
        expectedValues: ['p1:big', 'p1:small', 'p1:unknown'],
      },
      {
        name: 'lower input cost wins when role and context match',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'P',
            models: [
              { ...makeModel('expensive', 'primary'), maxContextTokens: 128000, costInputPer1M: 10 },
              { ...makeModel('cheap', 'primary'), maxContextTokens: 128000, costInputPer1M: 1 },
            ],
          }),
        ],
        flat: [],
        expectedValues: ['p1:cheap', 'p1:expensive'],
      },
      {
        name: 'flat entries sort after registry entries in the same role group',
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

  it('carries registry role and metadata onto the emitted option shape', () => {
    const result = buildModelDropdownOptions(
      [],
      [
        makeProvider({
          id: 'p1',
          name: 'P',
          models: [
            { ...makeModel('m1', 'reasoning'), costInputPer1M: 5, maxContextTokens: 200000 },
          ],
        }),
      ],
    );

    strictEqual(result[0].role, 'reasoning');
    strictEqual(result[0].costInputPer1M, 5);
    strictEqual(result[0].maxContextTokens, 200000);
  });

  it('labels are bare modelId regardless of provider name', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'DeepSeek',
        models: [
          { ...makeModel('deepseek-chat', 'primary'), costInputPer1M: 1.25, maxContextTokens: 1048576 },
        ],
      }),
    ];
    strictEqual(buildModelDropdownOptions([], registry)[0].label, 'deepseek-chat');
  });
});
