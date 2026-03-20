import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARSE_TEMPLATES,
  UNIT_BEARING_TEMPLATES,
  isUnitBearingTemplate,
  resolveOutputType,
} from '../parseTemplateRegistry';

describe('parseTemplateRegistry', () => {
  it('PARSE_TEMPLATES has exactly 12 entries', () => {
    assert.equal(PARSE_TEMPLATES.length, 12);
  });

  it('first entry is empty string (none)', () => {
    assert.equal(PARSE_TEMPLATES[0], '');
  });

  describe('isUnitBearingTemplate', () => {
    const unitTemplates = [
      'number_with_unit',
      'list_of_numbers_with_unit',
      'list_numbers_or_ranges_with_unit',
    ];

    for (const t of unitTemplates) {
      it(`returns true for ${t}`, () => {
        assert.equal(isUnitBearingTemplate(t), true);
      });
    }

    const nonUnitTemplates = PARSE_TEMPLATES.filter(
      (t) => !unitTemplates.includes(t),
    );
    for (const t of nonUnitTemplates) {
      it(`returns false for "${t || '(empty)'}"`, () => {
        assert.equal(isUnitBearingTemplate(t), false);
      });
    }

    it('UNIT_BEARING_TEMPLATES has exactly 3 entries', () => {
      assert.equal(UNIT_BEARING_TEMPLATES.size, 3);
    });
  });

  describe('resolveOutputType', () => {
    const expectations: Array<[string, string]> = [
      ['', 'string'],
      ['text_field', 'string'],
      ['text_block', 'string'],
      ['number_with_unit', 'number'],
      ['list_of_numbers_with_unit', 'number'],
      ['list_numbers_or_ranges_with_unit', 'number'],
      ['boolean_yes_no_unk', 'boolean'],
      ['url_field', 'url'],
      ['date_field', 'date'],
      ['list_of_tokens_delimited', 'list'],
      ['token_list', 'list'],
      ['component_reference', 'component_ref'],
    ];

    for (const [template, expected] of expectations) {
      it(`maps "${template || '(empty)'}" to "${expected}"`, () => {
        assert.equal(resolveOutputType(template), expected);
      });
    }

    it('falls back to "string" for unknown templates', () => {
      assert.equal(resolveOutputType('not_a_template'), 'string');
    });
  });
});
