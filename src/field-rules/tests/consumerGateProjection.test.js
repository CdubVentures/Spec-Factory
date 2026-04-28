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
          consumers: {
            'contract.shape': { seed: false },
            // WHY: parse.template retired — removed from consumer gate paths
            'enum.source': { indexlab: false },
            constraints: { indexlab: false }
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

test('projectFieldRulesForConsumer strips seed-disabled aliases for contract.shape', () => {
  const loaded = makeLoadedPayload();
  const projected = projectFieldRulesForConsumer(loaded, 'seed');

  const rule = projected.rules.fields.connection;
  assert.equal(rule.contract?.shape, undefined);
  assert.equal(rule.output_shape, undefined);
  assert.equal(rule.shape, undefined);
});

test('projectFieldRulesForConsumer strips canonical paths and legacy aliases for all registered delete families', () => {
  const loaded = {
    rules: {
      fields: {
        dpi: {
          contract: {
            type: 'number',
            shape: 'scalar',
            unit: 'dpi',
            range: { min: 100, max: 32000 },
            list_rules: { dedupe: true, sort: 'asc', item_union: 'set_union' },
          },
          data_type: 'number',
          type: 'number',
          output_shape: 'scalar',
          shape: 'scalar',
          unit: 'dpi',
          priority: {
            required_level: 'mandatory',
            availability: 'always',
            difficulty: 'easy',
          },
          required_level: 'mandatory',
          availability: 'always',
          difficulty: 'easy',
          enum: {
            policy: 'closed',
            source: 'data_lists.dpi',
            match: { format_hint: '^\\d+$' },
          },
          enum_policy: 'closed',
          enum_source: 'data_lists.dpi',
          enum_match_format_hint: '^\\d+$',
          evidence: {
            min_evidence_refs: 2,
            tier_preference: ['tier1'],
          },
          min_evidence_refs: 2,
          search_hints: {
            query_terms: ['dpi'],
            domain_hints: ['manufacturer'],
            content_types: ['spec_sheet'],
          },
          group: 'performance',
          constraints: ['dpi > 0'],
          aliases: ['resolution'],
          product_image_dependent: true,
          ai_assist: {
            reasoning_note: 'Use OEM specs.',
            color_edition_context: { enabled: true },
          },
          ui: { tooltip_md: 'Dots per inch.' },
          tooltip_md: 'Dots per inch.',
          consumers: {
            'contract.type': { seed: false },
            'contract.shape': { seed: false },
            'contract.unit': { seed: false },
            'contract.range': { seed: false },
            'contract.list_rules': { seed: false },
            'priority.required_level': { seed: false },
            'priority.availability': { seed: false },
            'priority.difficulty': { seed: false },
            'enum.policy': { seed: false },
            'enum.source': { seed: false },
            'enum.match.format_hint': { seed: false },
            'evidence.min_evidence_refs': { seed: false },
            'evidence.tier_preference': { seed: false },
            'search_hints.query_terms': { seed: false },
            'search_hints.domain_hints': { seed: false },
            'search_hints.content_types': { seed: false },
            group: { seed: false },
            constraints: { seed: false },
            aliases: { seed: false },
            product_image_dependent: { seed: false },
            'ai_assist.reasoning_note': { seed: false },
            'ai_assist.color_edition_context': { seed: false },
            'ui.tooltip_md': { seed: false },
          },
        },
      },
    },
  };

  const projected = projectFieldRulesForConsumer(loaded, 'seed');
  const rule = projected.rules.fields.dpi;

  assert.equal(rule.contract, undefined);
  assert.equal(rule.data_type, undefined);
  assert.equal(rule.type, undefined);
  assert.equal(rule.output_shape, undefined);
  assert.equal(rule.shape, undefined);
  assert.equal(rule.unit, undefined);
  assert.equal(rule.priority, undefined);
  assert.equal(rule.required_level, undefined);
  assert.equal(rule.availability, undefined);
  assert.equal(rule.difficulty, undefined);
  assert.equal(rule.enum, undefined);
  assert.equal(rule.enum_policy, undefined);
  assert.equal(rule.enum_source, undefined);
  assert.equal(rule.enum_match_format_hint, undefined);
  assert.equal(rule.evidence, undefined);
  assert.equal(rule.min_evidence_refs, undefined);
  assert.equal(rule.search_hints, undefined);
  assert.equal(rule.group, undefined);
  assert.equal(rule.constraints, undefined);
  assert.equal(rule.aliases, undefined);
  assert.equal(rule.product_image_dependent, undefined);
  assert.equal(rule.ai_assist, undefined);
  assert.equal(rule.ui, undefined);
  assert.equal(rule.tooltip_md, 'Dots per inch.');
});

test('projectFieldRulesForConsumer does not mutate input payload', () => {
  const loaded = makeLoadedPayload();
  const before = structuredClone(loaded);

  void projectFieldRulesForConsumer(loaded, 'indexlab');

  assert.deepEqual(loaded, before);
});
