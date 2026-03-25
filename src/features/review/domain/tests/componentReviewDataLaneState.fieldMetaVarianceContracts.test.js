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
