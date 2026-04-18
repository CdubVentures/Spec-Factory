// WHY: When a property is marked component_only, it disappears from
// fieldRules.fields (its product-level home). But Component Review still needs
// to render variance_policy / constraints / enum_values for that property when
// reviewing the component itself. resolvePropertyFieldMeta must fall back to
// fieldRules.component_db_sources[<type>].roles.properties[] so component-only
// properties keep their metadata instead of returning null.

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePropertyFieldMeta } from '../componentReviewHelpers.js';

function buildFieldRulesWithComponentOnly() {
  return {
    fields: {
      // dpi is a normal product field (not component_only)
      dpi: {
        variance_policy: 'upper_bound',
        constraints: [],
        enum: { policy: 'open', source: '' },
      },
      // encoder_steps is intentionally absent — it's component_only
    },
    component_db_sources: {
      encoder: {
        roles: {
          properties: [
            {
              field_key: 'encoder_steps',
              type: 'number',
              unit: '',
              variance_policy: 'authoritative',
              constraints: ['encoder_steps > 0'],
              component_only: true,
            },
            {
              field_key: 'encoder_type',
              type: 'string',
              unit: '',
              variance_policy: 'authoritative',
              constraints: [],
              component_only: true,
            },
          ],
        },
      },
    },
    knownValues: {
      enums: {
        encoder_type: { policy: 'closed', values: ['rotary', 'optical'] },
      },
    },
  };
}

test('resolvePropertyFieldMeta falls back to component_db_sources for component_only properties', () => {
  const meta = resolvePropertyFieldMeta('encoder_steps', buildFieldRulesWithComponentOnly());
  assert.ok(meta, 'component_only property must still resolve metadata via component_db_sources');
  assert.equal(meta.variance_policy, 'authoritative');
  assert.deepEqual(meta.constraints, ['encoder_steps > 0']);
});

test('resolvePropertyFieldMeta synthesizes enum_values for component_only properties from knownValues', () => {
  const meta = resolvePropertyFieldMeta('encoder_type', buildFieldRulesWithComponentOnly());
  assert.ok(meta, 'should resolve metadata');
  assert.deepEqual(meta.enum_values, ['rotary', 'optical']);
});

test('resolvePropertyFieldMeta still returns the product-field meta when fields[key] exists (regression guard)', () => {
  const meta = resolvePropertyFieldMeta('dpi', buildFieldRulesWithComponentOnly());
  assert.ok(meta);
  assert.equal(meta.variance_policy, 'upper_bound');
});

test('resolvePropertyFieldMeta returns null for unknown keys (no false positives from fallback)', () => {
  const meta = resolvePropertyFieldMeta('nonexistent_field', buildFieldRulesWithComponentOnly());
  assert.equal(meta, null);
});

test('resolvePropertyFieldMeta returns null for __-prefixed keys (no fallback for synthetic keys)', () => {
  const meta = resolvePropertyFieldMeta('__constraints', buildFieldRulesWithComponentOnly());
  assert.equal(meta, null);
});
