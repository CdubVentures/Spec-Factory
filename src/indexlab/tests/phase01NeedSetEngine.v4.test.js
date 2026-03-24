import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNeedSet,
  normalizeFieldKey,
  buildAllAliases,
  shardAliases,
  availabilityRank,
  difficultyRank,
  requiredLevelRank,
  makeBaseInput,
  makeBaseRules,
} from '../../../test/helpers/phase01NeedSetHarness.js';

describe('V4 - normalizeFieldKey', () => {
  it('replaces underscores with spaces', () => {
    assert.equal(normalizeFieldKey('battery_hours'), 'battery hours');
  });

  it('lowercases', () => {
    assert.equal(normalizeFieldKey('DPI_Max'), 'dpi max');
  });

  it('trims whitespace', () => {
    assert.equal(normalizeFieldKey('  weight  '), 'weight');
  });

  it('single word unchanged except lowercase', () => {
    assert.equal(normalizeFieldKey('rgb'), 'rgb');
  });

  it('empty/null -> empty string', () => {
    assert.equal(normalizeFieldKey(''), '');
    assert.equal(normalizeFieldKey(null), '');
    assert.equal(normalizeFieldKey(undefined), '');
  });

  it('multiple underscores', () => {
    assert.equal(normalizeFieldKey('feet_material_type'), 'feet material type');
  });
});

describe('V4 - buildAllAliases', () => {
  it('unions all sources, dedupes, sorts', () => {
    const result = buildAllAliases({
      normalizedKey: 'battery hours',
      displayName: 'Battery Life (Hours)',
      fieldAliases: ['battery life', 'battery runtime'],
      queryTerms: ['battery life', 'battery hours', 'runtime'],
    });
    assert.deepStrictEqual(result, [
      'battery hours',
      'battery life',
      'battery life (hours)',
      'battery runtime',
      'runtime',
    ]);
  });

  it('case-insensitive dedup', () => {
    const result = buildAllAliases({
      normalizedKey: 'dpi',
      displayName: 'DPI',
      fieldAliases: ['dpi', 'CPI'],
      queryTerms: ['DPI', 'cpi', 'max dpi'],
    });
    assert.ok(!result.some((alias, index) => result.indexOf(alias) !== index));
    assert.ok(result.includes('dpi'));
    assert.ok(result.includes('cpi'));
    assert.ok(result.includes('max dpi'));
  });

  it('empty inputs -> empty array', () => {
    const result = buildAllAliases({
      normalizedKey: '',
      displayName: '',
      fieldAliases: [],
      queryTerms: [],
    });
    assert.deepStrictEqual(result, []);
  });

  it('filters out empty strings', () => {
    const result = buildAllAliases({
      normalizedKey: 'weight',
      displayName: '',
      fieldAliases: ['', '  '],
      queryTerms: ['weight'],
    });
    assert.ok(!result.includes(''));
    assert.ok(result.includes('weight'));
  });
});

describe('V4 - shardAliases', () => {
  it('short alias list -> single shard', () => {
    const aliases = ['weight', 'mass', 'grams'];
    const result = shardAliases(aliases, 8);
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0], aliases);
  });

  it('long alias list -> multiple shards at whole alias boundaries', () => {
    const aliases = ['motion to photon latency', 'click delay', 'input lag', 'response time ms'];
    const result = shardAliases(aliases, 5);
    assert.equal(result.length, 3);
    assert.deepStrictEqual(result[0], ['motion to photon latency']);
    assert.deepStrictEqual(result[1], ['click delay', 'input lag']);
    assert.deepStrictEqual(result[2], ['response time ms']);
  });

  it('never splits a multi-word alias across shards', () => {
    const aliases = ['very long alias with many words here'];
    const result = shardAliases(aliases, 3);
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0], ['very long alias with many words here']);
  });

  it('empty aliases -> empty array', () => {
    assert.deepStrictEqual(shardAliases([], 8), []);
  });

  it('respects custom maxTokensPerShard', () => {
    const aliases = ['a', 'b', 'c', 'd', 'e'];
    const result = shardAliases(aliases, 2);
    assert.equal(result.length, 3);
    assert.deepStrictEqual(result[0], ['a', 'b']);
    assert.deepStrictEqual(result[1], ['c', 'd']);
    assert.deepStrictEqual(result[2], ['e']);
  });
});

describe('V4 - ranking helpers', () => {
  it('availabilityRank orders values correctly', () => {
    assert.equal(availabilityRank('always'), 0);
    assert.equal(availabilityRank('expected'), 1);
    assert.equal(availabilityRank('sometimes'), 2);
    assert.equal(availabilityRank('rare'), 3);
    assert.equal(availabilityRank('editorial_only'), 4);
  });

  it('availabilityRank sends unknown to highest rank', () => {
    assert.equal(availabilityRank('bogus'), 4);
    assert.equal(availabilityRank(''), 4);
  });

  it('difficultyRank orders values correctly', () => {
    assert.equal(difficultyRank('easy'), 0);
    assert.equal(difficultyRank('medium'), 1);
    assert.equal(difficultyRank('hard'), 2);
  });

  it('difficultyRank sends unknown to highest rank', () => {
    assert.equal(difficultyRank('impossible'), 2);
  });

  it('requiredLevelRank orders values correctly', () => {
    assert.equal(requiredLevelRank('identity'), 0);
    assert.equal(requiredLevelRank('critical'), 1);
    assert.equal(requiredLevelRank('required'), 2);
    assert.equal(requiredLevelRank('expected'), 3);
    assert.equal(requiredLevelRank('optional'), 4);
  });
});

describe('V4 - Schema 2 field entries carry V4 fields', () => {
  it('every field has normalized_key, all_aliases, alias_shards, availability, difficulty', () => {
    const result = computeNeedSet(makeBaseInput());
    for (const field of result.fields) {
      assert.ok(typeof field.normalized_key === 'string', `${field.field_key} missing normalized_key`);
      assert.ok(Array.isArray(field.all_aliases), `${field.field_key} missing all_aliases`);
      assert.ok(Array.isArray(field.alias_shards), `${field.field_key} missing alias_shards`);
      assert.ok(typeof field.availability === 'string', `${field.field_key} missing availability`);
      assert.ok(typeof field.difficulty === 'string', `${field.field_key} missing difficulty`);
      assert.ok(typeof field.repeat_count === 'number', `${field.field_key} missing repeat_count`);
      assert.ok(Array.isArray(field.query_modes_tried_for_key), `${field.field_key} missing query_modes_tried_for_key`);
      assert.ok(Array.isArray(field.domains_tried_for_key), `${field.field_key} missing domains_tried_for_key`);
      assert.ok(Array.isArray(field.content_types_tried_for_key), `${field.field_key} missing content_types_tried_for_key`);
    }
  });

  it('normalized_key derives correctly from field_key', () => {
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['dpi_max'], fieldRules: { dpi_max: makeBaseRules().dpi_max } }));
    const field = result.fields.find((entry) => entry.field_key === 'dpi_max');
    assert.equal(field.normalized_key, 'dpi max');
  });

  it('all_aliases unions display_name + normalized_key + rule.aliases + query_terms', () => {
    const rules = {
      weight: {
        required_level: 'required',
        display_name: 'Weight',
        aliases: ['mass'],
        min_evidence_refs: 1,
        search_hints: { query_terms: ['weight', 'grams'], preferred_content_types: ['spec'], domain_hints: [] },
      },
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['weight'], fieldRules: rules }));
    const field = result.fields.find((entry) => entry.field_key === 'weight');
    assert.ok(field.all_aliases.includes('weight'));
    assert.ok(field.all_aliases.includes('mass'));
    assert.ok(field.all_aliases.includes('grams'));
  });

  it('repeat_count = 0 on round 0', () => {
    const result = computeNeedSet(makeBaseInput({ round: 0 }));
    for (const field of result.fields) {
      assert.equal(field.repeat_count, 0);
    }
  });

  it('repeat_count carries from history on round 1+', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight'],
      fieldRules: { weight: makeBaseRules().weight },
      round: 2,
      previousFieldHistories: {
        weight: {
          query_count: 5,
          existing_queries: [],
          domains_tried: [],
          host_classes_tried: [],
          evidence_classes_tried: [],
          urls_examined_count: 0,
          no_value_attempts: 1,
          duplicate_attempts_suppressed: 0,
          query_modes_tried_for_key: ['key_search'],
        },
      },
    }));
    const field = result.fields.find((entry) => entry.field_key === 'weight');
    assert.equal(field.repeat_count, 5);
    assert.deepStrictEqual(field.query_modes_tried_for_key, ['key_search']);
  });

  it('query_modes_tried_for_key empty on round 0', () => {
    const result = computeNeedSet(makeBaseInput({ round: 0 }));
    assert.deepStrictEqual(result.fields[0].query_modes_tried_for_key, []);
  });
});

describe('V4 - search_intent is per-field, not per-group', () => {
  it('exact_match_required=true -> search_intent=exact_match', () => {
    const rules = {
      f1: { required_level: 'required', contract: { exact_match: true }, search_hints: { query_terms: ['x'], domain_hints: [] } },
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['f1'], fieldRules: rules }));
    const field = result.fields.find((entry) => entry.field_key === 'f1');
    assert.equal(field.search_intent, 'exact_match');
  });

  it('exact_match_required=false -> search_intent=broad', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.fields[0].search_intent, 'broad');
  });
});

describe('V4 - schema version', () => {
  it('schema_version is needset_output.v2.1', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.equal(result.schema_version, 'needset_output.v2.1');
  });
});

describe('V4 - sorted_unresolved_keys', () => {
  it('exists on output and is an array', () => {
    const result = computeNeedSet(makeBaseInput());
    assert.ok(Array.isArray(result.sorted_unresolved_keys));
  });

  it('contains only unresolved field_keys', () => {
    const result = computeNeedSet(makeBaseInput({
      fieldOrder: ['weight', 'sensor'],
      fieldRules: { weight: makeBaseRules().weight, sensor: makeBaseRules().sensor },
      provenance: { weight: { value: '58g', confidence: 0.95, pass_target: 0.8 } },
    }));
    assert.ok(!result.sorted_unresolved_keys.includes('weight'));
    assert.ok(result.sorted_unresolved_keys.includes('sensor'));
  });

  it('sorts by availability first', () => {
    const rules = {
      rare_field: { required_level: 'expected', priority: { availability: 'rare', difficulty: 'easy' }, search_hints: { query_terms: ['x'], domain_hints: [] } },
      always_field: { required_level: 'expected', priority: { availability: 'always', difficulty: 'easy' }, search_hints: { query_terms: ['y'], domain_hints: [] } },
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['rare_field', 'always_field'], fieldRules: rules }));
    assert.ok(result.sorted_unresolved_keys.indexOf('always_field') < result.sorted_unresolved_keys.indexOf('rare_field'));
  });

  it('same availability -> sorts by difficulty', () => {
    const rules = {
      hard_field: { required_level: 'expected', priority: { availability: 'expected', difficulty: 'hard' }, search_hints: { query_terms: ['x'], domain_hints: [] } },
      easy_field: { required_level: 'expected', priority: { availability: 'expected', difficulty: 'easy' }, search_hints: { query_terms: ['y'], domain_hints: [] } },
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['hard_field', 'easy_field'], fieldRules: rules }));
    assert.ok(result.sorted_unresolved_keys.indexOf('easy_field') < result.sorted_unresolved_keys.indexOf('hard_field'));
  });

  it('required_level is tie-breaker only', () => {
    const rules = {
      optional_easy: { required_level: 'optional', priority: { availability: 'always', difficulty: 'easy' }, search_hints: { query_terms: ['x'], domain_hints: [] } },
      critical_hard: { required_level: 'critical', priority: { availability: 'rare', difficulty: 'hard' }, search_hints: { query_terms: ['y'], domain_hints: [] } },
    };
    const result = computeNeedSet(makeBaseInput({ fieldOrder: ['optional_easy', 'critical_hard'], fieldRules: rules }));
    assert.ok(result.sorted_unresolved_keys.indexOf('optional_easy') < result.sorted_unresolved_keys.indexOf('critical_hard'));
  });

  it('rows stay sorted by bucket then field_key for backward compat', () => {
    const result = computeNeedSet(makeBaseInput());
    for (let index = 1; index < result.rows.length; index += 1) {
      const previous = result.rows[index - 1];
      const current = result.rows[index];
      const previousBucket = previous.priority_bucket === 'core' ? 0 : previous.priority_bucket === 'secondary' ? 1 : 2;
      const currentBucket = current.priority_bucket === 'core' ? 0 : current.priority_bucket === 'secondary' ? 1 : 2;
      assert.ok(previousBucket <= currentBucket);
    }
  });
});
