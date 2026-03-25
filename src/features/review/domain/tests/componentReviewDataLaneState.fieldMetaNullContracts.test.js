import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolvePropertyFieldMeta,
} from '../../tests/helpers/componentReviewHarness.js';

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
