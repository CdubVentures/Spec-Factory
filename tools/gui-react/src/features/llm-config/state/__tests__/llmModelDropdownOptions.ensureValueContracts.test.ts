import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import type { DropdownModelOption } from '../llmModelDropdownOptions.ts';
import { ensureValueInOptions } from '../llmModelDropdownOptions.ts';

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
});
