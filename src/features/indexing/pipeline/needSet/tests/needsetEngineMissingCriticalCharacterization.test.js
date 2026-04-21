// WHY: Locks the post-Phase-1 shape of
// `computeNeedSet().planner_seed.missing_critical_fields`. After the 5→2
// collapse of `required_level`, the filter at needsetEngine.js:625-627
// includes every field whose `required_level === 'mandatory'`. This test
// documents the EXPANSION: what was {identity, critical} = 2 categories is
// now {identity, critical, required} = mandatory. Any future change that
// restricts this set back to a subset must update this test explicitly.

import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { computeNeedSet } from '../needsetEngine.js';

function makeRule(requiredLevel) {
  return {
    priority: { required_level: requiredLevel, availability: 'always', difficulty: 'medium' },
    contract: { type: 'string', shape: 'scalar' },
  };
}

describe('computeNeedSet — post-Phase-1 missingCriticalFields characterization', () => {
  it('filter includes every mandatory-tier field, excludes non_mandatory', () => {
    const fieldOrder = ['m1', 'm2', 'n1', 'n2'];
    const fieldRules = {
      m1: makeRule('mandatory'),
      m2: makeRule('mandatory'),
      n1: makeRule('non_mandatory'),
      n2: makeRule('non_mandatory'),
    };

    const result = computeNeedSet({
      category: 'mouse',
      productId: 'test-post-phase-1',
      fieldOrder,
      fieldRules,
      provenance: {},
      identityContext: { confidence: 0 },
    });

    deepStrictEqual(
      result.planner_seed.missing_critical_fields.sort(),
      ['m1', 'm2'],
      'post-migration: missing_critical_fields is exactly the unresolved mandatory set'
    );
  });

  it('both tiers represented on planner_seed.unresolved_fields', () => {
    const fieldOrder = ['m1', 'm2', 'n1', 'n2'];
    const fieldRules = {
      m1: makeRule('mandatory'),
      m2: makeRule('mandatory'),
      n1: makeRule('non_mandatory'),
      n2: makeRule('non_mandatory'),
    };

    const result = computeNeedSet({
      category: 'mouse',
      productId: 'test-post-phase-1',
      fieldOrder,
      fieldRules,
      provenance: {},
      identityContext: { confidence: 0 },
    });

    deepStrictEqual(
      result.planner_seed.unresolved_fields.sort(),
      ['m1', 'm2', 'n1', 'n2'],
      'all unresolved fields appear regardless of tier'
    );
  });
});
