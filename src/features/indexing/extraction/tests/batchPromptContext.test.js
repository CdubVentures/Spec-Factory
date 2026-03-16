import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareBatchPromptContext } from '../batchPromptContext.js';

test('prepareBatchPromptContext builds prompt context and applies route-policy pruning', () => {
  const prepared = prepareBatchPromptContext({
    job: {
      productId: 'mouse-batch-context',
      category: 'mouse',
      identityLock: {
        brand: 'Razer',
        model: 'Viper V3 Pro'
      },
      anchors: {
        brand: 'Razer'
      }
    },
    categoryConfig: {
      category: 'mouse',
      fieldRules: {
        fields: {
          sensor: {
            description: 'Mouse sensor model',
            component_db_ref: 'sensor',
            required_level: 'critical',
            evidence: {
              required: true,
              min_evidence_refs: 2
            },
            parse: {
              template: 'component_name'
            },
            contract: {
              type: 'string',
              shape: 'scalar',
              enum: ['Focus Pro 35K']
            }
          }
        },
        parse_templates: {
          component_name: {
            description: 'Extract the component name from the snippet.',
            tests: [
              { raw: 'Sensor: Focus Pro 35K', expected: 'Focus Pro 35K' }
            ]
          }
        }
      },
      uiFieldCatalog: {
        fields: [
          {
            field_key: 'sensor',
            label: 'Sensor',
            tooltip_md: 'Sensor model tooltip'
          }
        ]
      }
    },
    batchFields: ['sensor'],
    scopedEvidencePack: {
      references: [
        {
          id: 'ref-sensor',
          source_id: 'manufacturer',
          url: 'https://example.com/spec',
          type: 'text'
        }
      ],
      snippets: [
        {
          id: 'ref-sensor',
          type: 'text',
          field_hints: ['sensor'],
          normalized_text: 'Sensor: Focus Pro 35K',
          snippet_hash: 'sha256:sensor'
        }
      ]
    },
    batchRoutePolicy: {
      min_evidence_refs_effective: 3,
      studio_contract_rules_sent_in_extract_review: false,
      studio_enum_options_sent_when_present: false,
      studio_component_entity_set_sent_when_component_field: false,
      studio_parse_template_sent_direct_in_extract_review: false,
      studio_tooltip_or_description_sent_when_present: false,
      studio_key_navigation_sent_in_extract_review: false,
      studio_send_booleans_prompted_to_model: false
    },
    componentDBs: {
      sensor: {
        entries: {
          focus_pro_35k: {
            canonical_name: 'Focus Pro 35K'
          }
        }
      }
    },
    knownValuesMap: {
      sensor: ['Focus Pro 35K', 'PAW3395']
    },
    goldenExamples: [
      { field: 'sensor', value: 'Focus Pro 35K' }
    ]
  });

  assert.deepEqual(prepared.batchFields, ['sensor']);
  assert.equal(prepared.validRefs.has('ref-sensor'), true);
  assert.equal(prepared.fieldSet.has('sensor'), true);
  assert.equal(prepared.minEvidenceRefsByField.sensor, 3);
  assert.equal(prepared.promptEvidence.references.length, 1);
  assert.equal(prepared.promptEvidence.snippets.length, 1);
  assert.equal(prepared.contextMatrix.fields.sensor.evidence_policy.min_evidence_refs, 2);
  assert.equal(prepared.contextMatrix.summary.prime_source_rows, 1);
  assert.deepEqual(prepared.userPayload.targetFields, ['sensor']);
  assert.deepEqual(prepared.userPayload.contracts, {});
  assert.deepEqual(prepared.userPayload.enumOptions, {});
  assert.deepEqual(prepared.userPayload.componentRefs, {});
  assert.equal(prepared.userPayload.extraction_context.fields.sensor.contract, undefined);
  assert.equal(prepared.userPayload.extraction_context.fields.sensor.parse_template_intent, undefined);
  assert.equal(prepared.userPayload.extraction_context.fields.sensor.ui, undefined);
});

test('prepareBatchPromptContext tolerates empty inputs', () => {
  const prepared = prepareBatchPromptContext({
    job: {
      productId: 'empty-batch-context',
      category: 'mouse',
      identityLock: {},
      anchors: {}
    },
    categoryConfig: {
      category: 'mouse',
      fieldRules: {
        fields: {}
      }
    },
    batchFields: [],
    scopedEvidencePack: {
      references: [],
      snippets: []
    }
  });

  assert.deepEqual(prepared.batchFields, []);
  assert.equal(prepared.validRefs.size, 0);
  assert.equal(prepared.fieldSet.size, 0);
  assert.deepEqual(prepared.minEvidenceRefsByField, {});
  assert.deepEqual(prepared.promptEvidence, {
    references: [],
    snippets: []
  });
  assert.deepEqual(prepared.userPayload.targetFields, []);
  assert.deepEqual(prepared.userPayload.references, []);
  assert.deepEqual(prepared.userPayload.snippets, []);
  assert.equal(prepared.contextMatrix.field_count, 0);
});
