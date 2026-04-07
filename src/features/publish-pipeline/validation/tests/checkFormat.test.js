import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkFormat } from '../checks/checkFormat.js';

describe('checkFormat — list_of_tokens_delimited (color token)', () => {
  const pass = [
    ['black',       'single color'],
    ['light-blue',  'hyphenated'],
    ['black+red',   'multi-color'],
    ['a1-b2',       'alphanumeric'],
  ];

  for (const [value, label] of pass) {
    it(`pass: ${label}`, () => {
      assert.equal(checkFormat(value, 'list_of_tokens_delimited').pass, true);
    });
  }

  const fail = [
    ['',          'empty string'],
    ['black red', 'space instead of hyphen'],
    ['123',       'starts with number'],
    ['black+',    'trailing +'],
    ['+black',    'leading +'],
  ];

  for (const [value, label] of fail) {
    it(`fail: ${label}`, () => {
      const r = checkFormat(value, 'list_of_tokens_delimited');
      assert.equal(r.pass, false);
      assert.equal(typeof r.reason, 'string');
    });
  }
});

describe('checkFormat — boolean_yes_no_unk', () => {
  const pass = ['yes', 'no', 'unk'];
  for (const v of pass) {
    it(`pass: "${v}"`, () => {
      assert.equal(checkFormat(v, 'boolean_yes_no_unk').pass, true);
    });
  }

  const fail = ['maybe', 'true', 'false', '1', ''];
  for (const v of fail) {
    it(`fail: "${v}"`, () => {
      assert.equal(checkFormat(v, 'boolean_yes_no_unk').pass, false);
    });
  }
});

describe('checkFormat — date_field (ISO)', () => {
  const pass = ['2024-10-01', '1999-01-01', '2030-12-31'];
  for (const v of pass) {
    it(`pass: "${v}"`, () => {
      assert.equal(checkFormat(v, 'date_field').pass, true);
    });
  }

  const fail = ['2024-1-1', '10/01/2024', '2024', 'Oct 2024', ''];
  for (const v of fail) {
    it(`fail: "${v}"`, () => {
      assert.equal(checkFormat(v, 'date_field').pass, false);
    });
  }
});

describe('checkFormat — text_field (no format regex)', () => {
  const cases = [
    ['launch-edition',  'kebab'],
    ['bluetooth-5.0',   'with period'],
    ['some random text','free form'],
    ['',                'empty string'],
  ];

  for (const [value, label] of cases) {
    it(`always pass: ${label}`, () => {
      assert.equal(checkFormat(value, 'text_field').pass, true);
    });
  }
});

describe('checkFormat — templates with null regex (always pass)', () => {
  const templates = [
    'number_with_unit', 'integer_field', 'integer_with_unit',
    'url_field', 'component_reference', 'latency_list_modes_ms',
    'list_of_numbers_with_unit', 'list_numbers_or_ranges',
  ];

  for (const tmpl of templates) {
    it(`${tmpl}: always pass`, () => {
      assert.equal(checkFormat('anything', tmpl).pass, true);
    });
  }
});

describe('checkFormat — unknown template (no regex → pass)', () => {
  it('unknown template passes', () => {
    assert.equal(checkFormat('anything', 'unknown_template_xyz').pass, true);
  });

  it('null template passes', () => {
    assert.equal(checkFormat('anything', null).pass, true);
  });

  it('undefined template passes', () => {
    assert.equal(checkFormat('anything', undefined).pass, true);
  });
});

describe('checkFormat — unk passthrough', () => {
  it('unk passes any format', () => {
    assert.equal(checkFormat('unk', 'boolean_yes_no_unk').pass, true);
  });

  it('unk passes color format', () => {
    assert.equal(checkFormat('unk', 'list_of_tokens_delimited').pass, true);
  });

  it('unk passes date format', () => {
    assert.equal(checkFormat('unk', 'date_field').pass, true);
  });
});

describe('checkFormat — non-string passthrough', () => {
  const cases = [42, null, true, undefined, ['a'], { a: 1 }];

  for (const value of cases) {
    it(`${typeof value} (${JSON.stringify(value)}) passes`, () => {
      assert.equal(checkFormat(value, 'boolean_yes_no_unk').pass, true);
    });
  }
});
