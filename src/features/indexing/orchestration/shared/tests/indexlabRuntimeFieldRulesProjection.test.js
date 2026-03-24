import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIndexlabRuntimeCategoryConfig } from '../indexlabRuntimeFieldRules.js';

test('buildIndexlabRuntimeCategoryConfig removes only disabled IDX paths and preserves authoring data', () => {
  const categoryConfig = {
    category: 'mouse',
    fieldRules: {
      fields: {
        weight: {
          contract: {
            type: 'number',
            shape: 'scalar',
            unit: 'g',
            range: { min: 30, max: 90 },
            list_rules: {
              dedupe: true,
              max_items: 4
            }
          },
          priority: {
            required_level: 'required',
            effort: 8
          },
          evidence: {
            min_evidence_refs: 2
          },
          ui: {
            tooltip_md: 'Weight in grams'
          },
          consumers: {
            'ui.tooltip_md': {
              indexlab: false
            }
          }
        }
      },
      knownValues: {
        enums: {
          switch: ['optical']
        }
      },
      parseTemplates: {
        templates: {
          weight: {
            description: 'Parse grams'
          }
        }
      }
    }
  };

  const projected = buildIndexlabRuntimeCategoryConfig(categoryConfig);

  assert.notEqual(projected, categoryConfig, 'projection should return a new category config object');
  assert.notEqual(projected.fieldRules, categoryConfig.fieldRules, 'projection should clone the field rules payload');
  assert.equal(projected.fieldRules.fields.weight.ui?.tooltip_md, undefined, 'disabled idx tooltip guidance should be removed from runtime field rules');
  assert.equal(projected.fieldRules.fields.weight.contract?.range?.min, 30, 'active contract.range should remain available to indexlab runtime');
  assert.equal(projected.fieldRules.fields.weight.contract?.list_rules?.max_items, 4, 'active contract.list_rules should remain available to indexlab runtime');
  assert.equal(projected.fieldRules.fields.weight.priority?.required_level, 'required', 'active priority rules should remain available to indexlab runtime');
  assert.equal(categoryConfig.fieldRules.fields.weight.ui?.tooltip_md, 'Weight in grams', 'authoring config should remain unchanged');
});
