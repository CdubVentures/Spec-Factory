import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStudioFieldRule } from '../compileFieldRuleBuilder.js';

function characterizeRule(rule) {
  // Phase 2: `component` block retired — linkage is `enum.source` only.
  return {
    key: rule.key,
    data_type: rule.data_type,
    output_shape: rule.output_shape,
    required_level: rule.required_level,
    availability: rule.availability,
    difficulty: rule.difficulty,
    aliases: rule.aliases,
    contract: rule.contract,
    enum: rule.enum,
    parse: rule.parse,
    priority: rule.priority,
    evidence: rule.evidence,
    search_hints: rule.search_hints,
    ai_assist: rule.ai_assist,
  };
}

test('buildStudioFieldRule characterizes representative field-rule shapes', () => {
  const cases = [
    {
      label: 'boolean contract forces scalar closed yes_no enum',
      input: {
        key: 'wireless',
        rule: {
          contract: {
            type: 'boolean',
            shape: 'list',
            unit: 'bool',
            range: { min: 0, max: 1 },
            list_rules: { dedupe: false, sort: 'asc' },
          },
          enum: { policy: 'open', source: 'wireless' },
        },
      },
      expected: {
        key: 'wireless',
        data_type: 'boolean',
        output_shape: 'scalar',
        required_level: 'non_mandatory',
        availability: 'sometimes',
        difficulty: 'medium',
        aliases: [],
        contract: { shape: 'scalar', type: 'boolean' },
        enum: { match: {}, policy: 'closed', source: 'yes_no' },
        parse: {},
        priority: {
          availability: 'sometimes',
          difficulty: 'medium',
          required_level: 'non_mandatory',
        },
        evidence: {
          min_evidence_refs: 1,
          tier_preference: ['tier1', 'tier2', 'tier3'],
        },
        search_hints: {
          domain_hints: ['manufacturer', 'support', 'manual', 'pdf'],
          preferred_tiers: ['tier1', 'tier2', 'tier3'],
          query_terms: ['Wireless'],
        },
        ai_assist: { reasoning_note: '' },
      },
    },
    {
      label: 'numeric scalar preserves unit rounding range priority and evidence',
      input: {
        key: 'click_latency',
        rule: {
          priority: {
            required_level: 'mandatory',
            availability: 'rare',
            difficulty: 'hard',
          },
          contract: {
            type: 'number',
            shape: 'scalar',
            unit: 'ms',
            rounding: { decimals: 2, mode: 'nearest' },
            range: { min: 0, max: 25 },
          },
          evidence: {
            min_evidence_refs: 2,
            tier_preference: ['tier2', 'tier1'],
          },
        },
      },
      expected: {
        key: 'click_latency',
        data_type: 'number',
        output_shape: 'scalar',
        required_level: 'mandatory',
        availability: 'rare',
        difficulty: 'hard',
        aliases: [],
        contract: {
          range: { max: 25, min: 0 },
          rounding: { decimals: 2, mode: 'nearest' },
          shape: 'scalar',
          type: 'number',
          unit: 'ms',
        },
        enum: {
          match: {},
          new_value_policy: {
            accept_if_evidence: true,
            mark_needs_curation: true,
          },
          policy: 'open_prefer_known',
          source: 'data_lists.click_latency',
        },
        parse: {},
        priority: {
          availability: 'rare',
          difficulty: 'hard',
          required_level: 'mandatory',
        },
        evidence: {
          min_evidence_refs: 2,
          tier_preference: ['tier2', 'tier1'],
        },
        search_hints: {
          domain_hints: ['manufacturer', 'support', 'manual', 'pdf'],
          preferred_tiers: ['tier1', 'tier2', 'tier3'],
          query_terms: ['Click Latency'],
        },
        ai_assist: { reasoning_note: '' },
      },
    },
    {
      label: 'list field preserves list rules aliases and authored search hints',
      input: {
        key: 'connection',
        rule: {
          contract: {
            type: 'string',
            shape: 'list',
            list_rules: { dedupe: false, sort: 'asc' },
          },
          aliases: [' connectivity ', 'connection'],
          search_hints: {
            query_terms: ['wireless'],
            domain_hints: ['manufacturer'],
          },
        },
      },
      expected: {
        key: 'connection',
        data_type: 'string',
        output_shape: 'list',
        required_level: 'non_mandatory',
        availability: 'sometimes',
        difficulty: 'medium',
        aliases: ['connectivity', 'connection'],
        contract: {
          list_rules: { dedupe: false, sort: 'asc' },
          shape: 'list',
          type: 'string',
        },
        enum: {
          match: {},
          new_value_policy: {
            accept_if_evidence: true,
            mark_needs_curation: true,
          },
          policy: 'open_prefer_known',
          source: 'data_lists.connection',
        },
        parse: { delimiters: [',', '/', '|', ';'] },
        priority: {
          availability: 'sometimes',
          difficulty: 'medium',
          required_level: 'non_mandatory',
        },
        evidence: {
          min_evidence_refs: 1,
          tier_preference: ['tier1', 'tier2', 'tier3'],
        },
        search_hints: {
          domain_hints: ['manufacturer'],
          preferred_tiers: ['tier1', 'tier2', 'tier3'],
          query_terms: ['wireless'],
        },
        ai_assist: { reasoning_note: '' },
      },
    },
    {
      label: 'closed enum-backed scalar keeps known-values source',
      input: {
        key: 'sensor_type',
        rule: {
          contract: { type: 'string', shape: 'scalar' },
          enum: { policy: 'closed', source: 'known_values.sensor_type' },
          vocab: { known_values: ['optical', 'laser'] },
        },
      },
      expected: {
        key: 'sensor_type',
        data_type: 'string',
        output_shape: 'scalar',
        required_level: 'non_mandatory',
        availability: 'sometimes',
        difficulty: 'medium',
        aliases: [],
        contract: { shape: 'scalar', type: 'string' },
        enum: {
          match: {},
          policy: 'closed',
          source: 'data_lists.sensor_type',
        },
        parse: {},
        priority: {
          availability: 'sometimes',
          difficulty: 'medium',
          required_level: 'non_mandatory',
        },
        evidence: {
          min_evidence_refs: 1,
          tier_preference: ['tier1', 'tier2', 'tier3'],
        },
        search_hints: {
          domain_hints: ['manufacturer', 'support', 'manual', 'pdf'],
          preferred_tiers: ['tier1', 'tier2', 'tier3'],
          query_terms: ['Sensor Type'],
        },
        ai_assist: { reasoning_note: '' },
      },
    },
    {
      label: 'component reference no longer emits any component block (Phase 2 retirement)',
      input: {
        key: 'sensor',
        rule: {
          contract: { type: 'string', shape: 'scalar' },
          component: {
            type: 'sensor',
            source: 'component_db.sensor',
            ai: {
              mode: 'judge',
              model_strategy: 'force_deep',
              context_level: 'properties_and_evidence',
              reasoning_note: 'match sensor',
            },
            priority: { difficulty: 'very_hard' },
          },
        },
        map: {
          component_sources: [
            {
              component_type: 'sensor',
              roles: { properties: [{ field_key: 'dpi' }, { key: 'ips' }] },
            },
          ],
        },
      },
      expected: {
        key: 'sensor',
        data_type: 'string',
        output_shape: 'scalar',
        required_level: 'non_mandatory',
        availability: 'sometimes',
        difficulty: 'medium',
        aliases: [],
        contract: { shape: 'scalar', type: 'string' },
        enum: {
          match: {},
          new_value_policy: {
            accept_if_evidence: true,
            mark_needs_curation: true,
          },
          policy: 'open_prefer_known',
          source: 'component_db.sensor',
        },
        parse: {},
        priority: {
          availability: 'sometimes',
          difficulty: 'medium',
          required_level: 'non_mandatory',
        },
        evidence: {
          min_evidence_refs: 1,
          tier_preference: ['tier1', 'tier2', 'tier3'],
        },
        // Phase 2: `component` block deleted from compile output entirely.
        // Linkage lives in `enum.source = component_db.sensor` only.
        search_hints: {
          domain_hints: ['manufacturer', 'support', 'manual', 'pdf'],
          preferred_tiers: ['tier1', 'tier2', 'tier3'],
          query_terms: ['Sensor'],
        },
        ai_assist: { reasoning_note: '' },
      },
    },
  ];

  for (const { label, input, expected } of cases) {
    assert.deepEqual(
      characterizeRule(buildStudioFieldRule(input)),
      expected,
      label,
    );
  }
});

test('buildStudioFieldRule derives known enum sources from the field key', () => {
  const knownPreferred = buildStudioFieldRule({
    category: 'mouse',
    key: 'color',
    rule: {
      key: 'color',
      contract: { type: 'string', shape: 'scalar' },
      enum: { policy: 'open_prefer_known' },
    },
  });
  assert.equal(knownPreferred.enum.policy, 'open_prefer_known');
  assert.equal(knownPreferred.enum.source, 'data_lists.color');

  const closed = buildStudioFieldRule({
    category: 'mouse',
    key: 'color',
    rule: {
      key: 'color',
      contract: { type: 'string', shape: 'scalar' },
      enum: { policy: 'closed', source: 'data_lists.colors' },
    },
  });
  assert.equal(closed.enum.policy, 'closed');
  assert.equal(closed.enum.source, 'data_lists.color');

  const open = buildStudioFieldRule({
    category: 'mouse',
    key: 'color',
    rule: {
      key: 'color',
      contract: { type: 'string', shape: 'scalar' },
      enum: { policy: 'open', source: 'data_lists.color' },
    },
  });
  assert.equal(open.enum.policy, 'open');
  assert.equal(open.enum.source, null);
});
