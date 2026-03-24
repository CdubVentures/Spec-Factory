import test from 'node:test';
import assert from 'node:assert/strict';

import { FieldRulesEngine } from '../fieldRulesEngine.js';
import { applyRuntimeFieldRules } from '../runtimeGate.js';

test('indexlab consumer gate disables per-field min evidence refs when configured off', () => {
  const engine = new FieldRulesEngine({
    category: 'mouse',
    loaded: {
      rules: {
        fields: {
          connection: {
            contract: { type: 'string', shape: 'scalar' },
            evidence: {
              required: false,
              min_evidence_refs: 2
            },
            consumers: {
              'evidence.min_evidence_refs': {
                indexlab: false
              }
            }
          }
        }
      },
      knownValues: {},
      parseTemplates: { templates: {} },
      crossValidation: [],
      componentDBs: {},
      uiFieldCatalog: { fields: [] }
    },
    options: {
      consumerSystem: 'indexlab'
    }
  });

  const result = applyRuntimeFieldRules({
    engine,
    fields: {
      connection: 'wired'
    },
    provenance: {
      connection: {
        url: 'https://example.com/spec',
        snippet_id: 's1',
        quote: 'wired',
        evidence: [
          { url: 'https://example.com/spec', snippet_id: 's1', quote: 'wired' }
        ]
      }
    },
    respectPerFieldEvidence: true
  });

  assert.equal(result.fields.connection, 'wired');
  assert.equal(result.failures.length, 0);
});

