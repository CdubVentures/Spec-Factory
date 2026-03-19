import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  isObject,
  hasOwn,
  readPathValue,
  hasPathValue,
  normalizeText,
  countRuleValues,
  countEffectiveDomainRuleValues,
  FIELD_RULE_GATE_SPECS,
  buildFieldRuleGateCountsFromRules,
  buildFieldRuleHintCountsByFieldFromRules,
  hasFieldRuleGateCounts,
  hasFieldRuleHintCountsByField,
  hydrateFieldRuleGateCounts,
  loadRuntimeFieldRulesPayload,
} from '../../../../src/features/indexing/api/builders/runtimeOpsFieldRuleGateHelpers.js';

describe('isObject', () => {
  test('returns true for plain objects', () => {
    assert.equal(isObject({}), true);
    assert.equal(isObject({ a: 1 }), true);
  });

  test('returns false for arrays, null, primitives', () => {
    assert.equal(isObject([]), false);
    assert.equal(isObject(null), false);
    assert.equal(isObject(undefined), false);
    assert.equal(isObject('string'), false);
    assert.equal(isObject(42), false);
    assert.equal(isObject(false), false);
  });
});

describe('hasOwn', () => {
  test('returns true for own properties', () => {
    assert.equal(hasOwn({ a: 1 }, 'a'), true);
  });

  test('returns false for inherited properties', () => {
    assert.equal(hasOwn({}, 'toString'), false);
  });

  test('returns false for missing properties', () => {
    assert.equal(hasOwn({ a: 1 }, 'b'), false);
  });
});

describe('readPathValue', () => {
  test('reads nested values', () => {
    const obj = { a: { b: { c: 42 } } };
    assert.equal(readPathValue(obj, ['a', 'b', 'c']), 42);
  });

  test('returns undefined for missing path', () => {
    assert.equal(readPathValue({ a: 1 }, ['b']), undefined);
  });

  test('returns target with empty path', () => {
    const obj = { a: 1 };
    assert.equal(readPathValue(obj, []), obj);
  });

  test('returns undefined when traversing non-objects', () => {
    assert.equal(readPathValue({ a: 'string' }, ['a', 'b']), undefined);
  });
});

describe('hasPathValue', () => {
  test('returns true for existing nested path', () => {
    assert.equal(hasPathValue({ a: { b: 1 } }, ['a', 'b']), true);
  });

  test('returns false for missing path', () => {
    assert.equal(hasPathValue({ a: 1 }, ['b']), false);
  });

  test('returns false for empty path segments', () => {
    assert.equal(hasPathValue({ a: 1 }, []), false);
  });
});

describe('normalizeText', () => {
  test('trims whitespace', () => {
    assert.equal(normalizeText('  hello  '), 'hello');
  });

  test('handles null/undefined', () => {
    assert.equal(normalizeText(null), '');
    assert.equal(normalizeText(undefined), '');
  });
});

describe('countRuleValues', () => {
  test('counts array entries after normalization', () => {
    assert.equal(countRuleValues(['a', 'b', '']), 2);
  });

  test('returns 1 for non-empty string', () => {
    assert.equal(countRuleValues('value'), 1);
  });

  test('returns 0 for empty string', () => {
    assert.equal(countRuleValues(''), 0);
  });

  test('returns 0 for empty array', () => {
    assert.equal(countRuleValues([]), 0);
  });
});

describe('countEffectiveDomainRuleValues', () => {
  test('counts only values with dots (domain-like)', () => {
    assert.equal(countEffectiveDomainRuleValues(['example.com', 'nodot', 'another.org']), 2);
  });

  test('returns 0 for non-domain values', () => {
    assert.equal(countEffectiveDomainRuleValues(['nodot', 'alsonodot']), 0);
  });

  test('handles single string value', () => {
    assert.equal(countEffectiveDomainRuleValues('example.com'), 1);
    assert.equal(countEffectiveDomainRuleValues('nodot'), 0);
  });
});

describe('FIELD_RULE_GATE_SPECS', () => {
  test('has 3 entries with expected keys', () => {
    assert.equal(FIELD_RULE_GATE_SPECS.length, 3);
    const names = FIELD_RULE_GATE_SPECS.map((s) => s.name);
    assert.ok(names.includes('query_terms'));
    assert.ok(names.includes('domain_hints'));
    assert.ok(names.includes('preferred_content_types'));
  });

  test('each spec has key, name, and path', () => {
    for (const spec of FIELD_RULE_GATE_SPECS) {
      assert.ok(spec.key);
      assert.ok(spec.name);
      assert.ok(Array.isArray(spec.path));
    }
  });
});

describe('buildFieldRuleGateCountsFromRules', () => {
  test('returns empty object for missing fields', () => {
    assert.deepEqual(buildFieldRuleGateCountsFromRules({}), {});
  });

  test('returns zero-count specs for empty fields object', () => {
    const counts = buildFieldRuleGateCountsFromRules({ fields: {} });
    for (const spec of FIELD_RULE_GATE_SPECS) {
      assert.ok(counts[spec.key]);
      assert.equal(counts[spec.key].value_count, 0);
      assert.equal(counts[spec.key].status, 'zero');
    }
  });

  test('counts values from field rules with search_hints', () => {
    const payload = {
      fields: {
        price: {
          search_hints: {
            query_terms: ['cheap', 'price'],
            domain_hints: ['amazon.com'],
            preferred_content_types: ['product_page'],
          },
        },
      },
    };
    const counts = buildFieldRuleGateCountsFromRules(payload);
    assert.ok(counts['search_hints.query_terms']);
    assert.equal(counts['search_hints.query_terms'].value_count, 2);
    assert.equal(counts['search_hints.query_terms'].status, 'active');
    assert.equal(counts['search_hints.domain_hints'].value_count, 1);
  });

  test('domain_hints uses effective (dot-containing) count', () => {
    const payload = {
      fields: {
        name: {
          search_hints: {
            domain_hints: ['amazon.com', 'nodot', 'newegg.com'],
          },
        },
      },
    };
    const counts = buildFieldRuleGateCountsFromRules(payload);
    assert.equal(counts['search_hints.domain_hints'].value_count, 2);
    assert.equal(counts['search_hints.domain_hints'].total_value_count, 3);
  });
});

describe('buildFieldRuleHintCountsByFieldFromRules', () => {
  test('returns empty object for empty fields', () => {
    assert.deepEqual(buildFieldRuleHintCountsByFieldFromRules({}), {});
  });

  test('produces per-field breakdown', () => {
    const payload = {
      fields: {
        price: {
          search_hints: {
            query_terms: ['buy'],
          },
        },
      },
    };
    const result = buildFieldRuleHintCountsByFieldFromRules(payload);
    assert.ok(result.price);
    assert.ok(result.price.query_terms);
    assert.equal(result.price.query_terms.value_count, 1);
  });
});

describe('hasFieldRuleGateCounts', () => {
  test('returns true when field_rule_gate_counts has entries', () => {
    assert.equal(hasFieldRuleGateCounts({ field_rule_gate_counts: { a: 1 } }), true);
  });

  test('returns false for empty or missing counts', () => {
    assert.equal(hasFieldRuleGateCounts({}), false);
    assert.equal(hasFieldRuleGateCounts({ field_rule_gate_counts: {} }), false);
    assert.equal(hasFieldRuleGateCounts(null), false);
  });
});

describe('hasFieldRuleHintCountsByField', () => {
  test('returns true when field_rule_hint_counts_by_field has entries', () => {
    assert.equal(hasFieldRuleHintCountsByField({ field_rule_hint_counts_by_field: { a: 1 } }), true);
  });

  test('returns false for empty or missing counts', () => {
    assert.equal(hasFieldRuleHintCountsByField({}), false);
    assert.equal(hasFieldRuleHintCountsByField(null), false);
  });
});

describe('hydrateFieldRuleGateCounts', () => {
  test('returns profile unchanged when already hydrated', async () => {
    const profile = {
      field_rule_gate_counts: { x: 1 },
      field_rule_hint_counts_by_field: { y: 1 },
    };
    const result = await hydrateFieldRuleGateCounts({
      searchProfile: profile,
      fieldRulesPayload: {},
    });
    assert.equal(result, profile);
  });

  test('returns profile unchanged for non-object payload', async () => {
    const profile = { some: 'data' };
    const result = await hydrateFieldRuleGateCounts({
      searchProfile: profile,
      fieldRulesPayload: null,
    });
    assert.equal(result, profile);
  });

  test('returns non-object profile as-is', async () => {
    const result = await hydrateFieldRuleGateCounts({
      searchProfile: null,
      fieldRulesPayload: { fields: {} },
    });
    assert.equal(result, null);
  });

  test('hydrates missing gate counts from field rules', async () => {
    const profile = { query_rows: [] };
    const payload = {
      fields: {
        price: {
          search_hints: {
            query_terms: ['buy'],
          },
        },
      },
    };
    const result = await hydrateFieldRuleGateCounts({
      searchProfile: profile,
      fieldRulesPayload: payload,
    });
    assert.ok(result.field_rule_gate_counts);
    assert.ok(result.field_rule_hint_counts_by_field);
  });
});

describe('loadRuntimeFieldRulesPayload', () => {
  test('returns null for empty category', async () => {
    const result = await loadRuntimeFieldRulesPayload({
      category: '',
      config: {},
      safeReadJson: async () => null,
      path,
    });
    assert.equal(result, null);
  });

  test('returns null when no field rules file found', async () => {
    const result = await loadRuntimeFieldRulesPayload({
      category: 'mouse',
      config: {},
      safeReadJson: async () => null,
      path,
    });
    assert.equal(result, null);
  });

  test('returns projected field rules when file exists', async () => {
    const fakeRules = {
      fields: {
        price: { search_hints: { query_terms: ['buy'] } },
      },
    };
    const result = await loadRuntimeFieldRulesPayload({
      category: 'mouse',
      config: {},
      safeReadJson: async (p) => {
        if (p.includes('field_rules.runtime.json')) return fakeRules;
        return null;
      },
      path,
    });
    assert.ok(result);
    assert.ok(result.fields);
  });
});
