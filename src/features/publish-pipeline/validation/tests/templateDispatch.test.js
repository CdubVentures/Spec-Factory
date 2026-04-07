import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTemplate } from '../templateDispatch.js';

describe('dispatchTemplate — dispatched templates', () => {
  it('boolean_yes_no_unk: "true" -> "yes"', () => {
    assert.strictEqual(dispatchTemplate('boolean_yes_no_unk', 'true'), 'yes');
  });

  it('boolean_yes_no_unk: "no" -> "no"', () => {
    assert.strictEqual(dispatchTemplate('boolean_yes_no_unk', 'no'), 'no');
  });

  it('boolean_yes_no_unk: "unk" -> "unk"', () => {
    assert.strictEqual(dispatchTemplate('boolean_yes_no_unk', 'unk'), 'unk');
  });

  it('list_of_tokens_delimited: "Black, White" -> ["black", "white"]', () => {
    assert.deepStrictEqual(
      dispatchTemplate('list_of_tokens_delimited', 'Black, White'),
      ['black', 'white'],
    );
  });

  it('date_field: "2024-10-01" -> ISO string', () => {
    const result = dispatchTemplate('date_field', '2024-10-01');
    assert.ok(result);
    assert.ok(result.startsWith('2024-10-01'));
  });

  it('latency_list_modes_ms: "1.1 wired" -> [{value:1.1, mode:"wired"}]', () => {
    assert.deepStrictEqual(
      dispatchTemplate('latency_list_modes_ms', '1.1 wired'),
      [{ value: 1.1, mode: 'wired' }],
    );
  });

  it('list_of_numbers_with_unit: "125, 500, 1000" -> [1000, 500, 125]', () => {
    assert.deepStrictEqual(
      dispatchTemplate('list_of_numbers_with_unit', '125, 500, 1000'),
      [1000, 500, 125],
    );
  });
});

describe('dispatchTemplate — fallthrough templates', () => {
  const fallthroughs = [
    ['text_field',          'hello',        'text_field'],
    ['number_with_unit',    '42g',          'number_with_unit'],
    ['integer_field',       '5',            'integer_field'],
    ['integer_with_unit',   '5mm',          'integer_with_unit'],
    ['url_field',           'http://x.com', 'url_field'],
    ['component_reference', 'PAW3395',      'component_reference'],
    ['list_numbers_or_ranges', '1, 2, 3',  'list_numbers_or_ranges'],
  ];

  for (const [template, input, label] of fallthroughs) {
    it(`${label} -> null (fallthrough)`, () => {
      assert.strictEqual(dispatchTemplate(template, input), null);
    });
  }
});

describe('dispatchTemplate — unknown template', () => {
  it('returns null for unknown template', () => {
    assert.strictEqual(dispatchTemplate('unknown_template', 'x'), null);
  });

  it('returns null for null template', () => {
    assert.strictEqual(dispatchTemplate(null, 'x'), null);
  });

  it('returns null for undefined template', () => {
    assert.strictEqual(dispatchTemplate(undefined, 'x'), null);
  });
});
