// Characterization test: proves dedupe+sort output is identical with and without min_items/max_items.
// Temporary — prune after list-items retirement is verified green.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforceListRules } from '../checks/enforceListRules.js';

function stripLimits({ min_items, max_items, ...rest }) { return rest; }
function dedupeSortOnly(repairs) {
  return repairs.filter(r => ['dedupe', 'sort_alpha', 'sort_numeric'].includes(r.rule));
}

describe('enforceListRules — golden-master: dedupe+sort invariance over min/max presence', () => {
  const cases = [
    {
      label: 'dedupe only, no sort',
      input: ['a', 'b', 'a', 'c'],
      rules: { dedupe: true, sort: 'none', min_items: 0, max_items: 100 }
    },
    {
      label: 'dedupe + alpha sort',
      input: ['cherry', 'apple', 'banana', 'apple'],
      rules: { dedupe: true, sort: 'alpha', min_items: 0, max_items: 5 }
    },
    {
      label: 'dedupe + numeric sort',
      input: [30, 10, 20, 10],
      rules: { dedupe: true, sort: 'numeric', min_items: 2, max_items: 10 }
    },
    {
      label: 'no dedupe, no sort (passthrough)',
      input: ['a', 'b', 'a'],
      rules: { dedupe: false, sort: 'none', min_items: 0, max_items: 100 }
    },
    {
      label: 'empty array',
      input: [],
      rules: { dedupe: true, sort: 'alpha', min_items: 0, max_items: 100 }
    },
    {
      label: 'single element',
      input: ['only'],
      rules: { dedupe: true, sort: 'alpha', min_items: 0, max_items: 5 }
    },
    {
      label: 'no dupes, alpha sort',
      input: ['c', 'a', 'b'],
      rules: { dedupe: true, sort: 'alpha', min_items: 0, max_items: 100 }
    },
    {
      label: 'numeric no dupes, numeric sort',
      input: [3, 1, 2],
      rules: { dedupe: true, sort: 'numeric', min_items: 0, max_items: 10 }
    }
  ];

  for (const { label, input, rules } of cases) {
    it(`values identical: ${label}`, () => {
      const with_ = enforceListRules(input, rules);
      const without_ = enforceListRules(input, stripLimits(rules));
      assert.deepStrictEqual(with_.values, without_.values, `values diverged for: ${label}`);
    });

    it(`dedupe+sort repairs identical: ${label}`, () => {
      const with_ = enforceListRules(input, rules);
      const without_ = enforceListRules(input, stripLimits(rules));
      assert.deepStrictEqual(
        dedupeSortOnly(with_.repairs),
        dedupeSortOnly(without_.repairs),
        `dedupe+sort repairs diverged for: ${label}`
      );
    });
  }
});

// NOTE: The "expected divergence" tests that documented max_items truncation and
// min_items rejection were removed as part of Phase 2 retirement — those code paths
// no longer exist in enforceListRules.
