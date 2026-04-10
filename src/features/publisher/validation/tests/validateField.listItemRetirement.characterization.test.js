// Characterization test: proves validateField list handling is identical with and without min_items/max_items.
// Temporary — prune after list-items retirement is verified green.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateField } from '../validateField.js';

function listRule({ type = 'string', listRules }) {
  return {
    contract: { shape: 'list', type, list_rules: listRules },
    parse: {},
    enum: {},
  };
}

function stripLimits({ min_items, max_items, ...rest }) { return rest; }

describe('validateField — golden-master: list field identity over min/max presence', () => {
  const cases = [
    {
      label: 'dedupe, no sort',
      input: ['black', 'white', 'black'],
      rules: { dedupe: true, sort: 'none', min_items: 0, max_items: 100 }
    },
    {
      label: 'dedupe + alpha sort',
      input: ['cherry', 'apple', 'banana', 'apple'],
      rules: { dedupe: true, sort: 'alpha', min_items: 0, max_items: 5 }
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
      input: ['one'],
      rules: { dedupe: true, sort: 'alpha', min_items: 0, max_items: 5 }
    }
  ];

  for (const { label, input, rules } of cases) {
    it(`value identical: ${label}`, () => {
      const rWith = validateField({ fieldKey: 'test', value: input, fieldRule: listRule({ listRules: rules }) });
      const rNo = validateField({ fieldKey: 'test', value: input, fieldRule: listRule({ listRules: stripLimits(rules) }) });
      assert.deepStrictEqual(rWith.value, rNo.value, `value diverged for: ${label}`);
    });

    it(`list_rules repairs identical: ${label}`, () => {
      const rWith = validateField({ fieldKey: 'test', value: input, fieldRule: listRule({ listRules: rules }) });
      const rNo = validateField({ fieldKey: 'test', value: input, fieldRule: listRule({ listRules: stripLimits(rules) }) });
      const listRepWith = rWith.repairs.filter(r => r.step === 'list_rules');
      const listRepNo = rNo.repairs.filter(r => r.step === 'list_rules');
      assert.deepStrictEqual(listRepWith, listRepNo, `list_rules repairs diverged for: ${label}`);
    });

    it(`no spurious min_items rejections: ${label}`, () => {
      const rNo = validateField({ fieldKey: 'test', value: input, fieldRule: listRule({ listRules: stripLimits(rules) }) });
      const spurious = rNo.rejections.filter(r => r.reason_code === 'min_items_violation');
      assert.equal(spurious.length, 0, `spurious min_items rejection for: ${label}`);
    });
  }
});
