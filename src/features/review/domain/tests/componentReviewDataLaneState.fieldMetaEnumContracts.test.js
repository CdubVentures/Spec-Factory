import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePropertyFieldMeta,
} from '../../tests/helpers/componentReviewHarness.js';

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
