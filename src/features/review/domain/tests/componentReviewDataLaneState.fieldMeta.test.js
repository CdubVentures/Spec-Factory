import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePropertyFieldMeta,
} from '../../tests/helpers/componentReviewHarness.js';

test('resolvePropertyFieldMeta returns variance_policy and constraints from field definition', () => {
  const fieldRules = {
    rules: {
      fields: {
        dpi: {
          variance_policy: 'upper_bound',
          constraints: [],
        },
      },
    },
    knownValues: { enums: {} },
  };

  assert.deepStrictEqual(resolvePropertyFieldMeta('dpi', fieldRules), {
    variance_policy: 'upper_bound',
    constraints: [],
    enum_values: null,
    enum_policy: null,
  });
});

test('resolvePropertyFieldMeta returns enum_values and enum_policy for enum fields', () => {
  const fieldRules = {
    rules: {
      fields: {
        encoder_type: {
          variance_policy: 'authoritative',
          constraints: [],
          enum: { policy: 'closed', source: 'data_lists.encoder_type' },
        },
      },
    },
    knownValues: {
      enums: {
        encoder_type: { policy: 'closed', values: ['optical', 'mechanical'] },
      },
    },
  };

  assert.deepStrictEqual(resolvePropertyFieldMeta('encoder_type', fieldRules), {
    variance_policy: 'authoritative',
    constraints: [],
    enum_values: ['optical', 'mechanical'],
    enum_policy: 'closed',
  });
});

test('resolvePropertyFieldMeta returns null for unknown keys and identity keys', () => {
  const fieldRules = {
    rules: {
      fields: {
        dpi: { variance_policy: 'upper_bound', constraints: [] },
        __name: { variance_policy: null, constraints: [] },
      },
    },
    knownValues: { enums: {} },
  };

  assert.strictEqual(resolvePropertyFieldMeta('nonexistent_key', fieldRules), null);
  assert.strictEqual(resolvePropertyFieldMeta('__name', fieldRules), null);
});
