import test from 'node:test';
import assert from 'node:assert/strict';

import { projectFieldRulesForConsumer } from '../consumerGate.js';

function makeLoadedPayload() {
  return {
    rules: {
      fields: {
        connection: {
          contract: {
            type: 'string',
            shape: 'list'
          },
          data_type: 'string',
          output_shape: 'list',
          parse: {},
          enum: {
            policy: 'closed',
            source: 'data_lists.connection'
          },
          enum_policy: 'closed',
          enum_source: 'data_lists.connection',
          constraints: ['connection != none'],
          component: {
            type: 'sensor'
          },
          component_db_ref: 'sensor',
          consumers: {
            'contract.shape': { seed: false },
            // WHY: parse.template retired — removed from consumer gate paths
            'enum.source': { indexlab: false },
            constraints: { indexlab: false },
            'component.type': { seed: false }
          }
        }
      }
    },
    knownValues: {
      enums: {
        connection: {
          policy: 'closed',
          values: ['wired', 'wireless']
        }
      }
    },
    parseTemplates: {
      templates: {
        connection: {
          template: 'list_of_tokens_delimited',
          patterns: []
        }
      }
    },
    crossValidation: [
      {
        rule_id: 'cv_connection',
        trigger_field: 'connection',
        check: { type: 'group_completeness', minimum_present: 1 }
      }
    ]
  };
}

test('projectFieldRulesForConsumer strips indexlab-disabled paths and linked artifacts', () => {
  const loaded = makeLoadedPayload();
  const projected = projectFieldRulesForConsumer(loaded, 'indexlab');

  const rule = projected.rules.fields.connection;
  // WHY: parse.template retired. Verify enum.source still stripped.
  assert.equal(rule.enum?.source, undefined);
  assert.equal(rule.enum_source, undefined);
  assert.equal(rule.constraints, undefined);
  assert.equal(projected.knownValues?.enums?.connection, undefined);
  // WHY: Extraction patterns (parseTemplates) always pass through — they're needed
  // regardless of consumer gate settings. Only field-rule knobs get gated.
  assert.ok(projected.parseTemplates?.templates?.connection, 'extraction patterns always pass through');
  assert.equal(projected.crossValidation.length, 0);
});

test('projectFieldRulesForConsumer strips seed-disabled aliases for contract.shape and component.type', () => {
  const loaded = makeLoadedPayload();
  const projected = projectFieldRulesForConsumer(loaded, 'seed');

  const rule = projected.rules.fields.connection;
  assert.equal(rule.contract?.shape, undefined);
  assert.equal(rule.output_shape, undefined);
  assert.equal(rule.shape, undefined);
  assert.equal(rule.component?.type, undefined);
  assert.equal(rule.component_db_ref, undefined);
});

test('projectFieldRulesForConsumer does not mutate input payload', () => {
  const loaded = makeLoadedPayload();
  const before = structuredClone(loaded);

  void projectFieldRulesForConsumer(loaded, 'indexlab');

  assert.deepEqual(loaded, before);
});

