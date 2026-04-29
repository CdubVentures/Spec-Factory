import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseList,
  normalizeBoolean,
  parseDate,
} from '../normalizers.js';

describe('parseList', () => {
  const cases = [
    ['a, b, c',       ['a', 'b', 'c'],   'comma split + trim'],
    ['a; b; c',       ['a', 'b', 'c'],   'semicolon split'],
    ['a|b|c',         ['a', 'b', 'c'],   'pipe split'],
    ['a/b/c',         ['a', 'b', 'c'],   'slash split'],
    ['solo',          ['solo'],           'single value'],
    [', a, , b, ',    ['a', 'b'],         'filter blanks'],
    ['',              [],                  'empty string'],
    [null,            [],                  'null'],
    [undefined,       [],                  'undefined'],
  ];

  for (const [input, expected, label] of cases) {
    it(label, () => {
      assert.deepStrictEqual(parseList(input), expected);
    });
  }

  it('array passthrough', () => {
    const arr = ['a', 'b'];
    assert.deepStrictEqual(parseList(arr), arr);
  });
});

describe('normalizeBoolean', () => {
  const yes = [
    ['yes',   'canonical yes'],
    ['Yes',   'case insensitive'],
    ['YES',   'uppercase'],
    ['true',  'true -> yes'],
    ['1',     '1 -> yes'],
    ['y',     'short form y'],
    ['on',    'on -> yes'],
    [true,    'JS boolean true'],
  ];

  for (const [input, label] of yes) {
    it(`yes: ${label}`, () => {
      assert.strictEqual(normalizeBoolean(input), 'yes');
    });
  }

  const no = [
    ['no',    'canonical no'],
    ['No',    'case insensitive'],
    ['false', 'false -> no'],
    ['0',     '0 -> no'],
    ['n',     'short form n'],
    ['off',   'off -> no'],
    [false,   'JS boolean false'],
  ];

  for (const [input, label] of no) {
    it(`no: ${label}`, () => {
      assert.strictEqual(normalizeBoolean(input), 'no');
    });
  }

  const absent = [
    ['unk',       'unk token → null'],
    ['unknown',   'verbose unknown → null'],
    ['',          'empty → null'],
    [null,        'null → null'],
    [undefined,   'undefined → null'],
  ];

  for (const [input, label] of absent) {
    it(`absent: ${label}`, () => {
      assert.strictEqual(normalizeBoolean(input), null);
    });
  }

  const notApplicable = [
    ['n/a', 'canonical n/a'],
    ['N/A', 'case insensitive n/a'],
    ['na', 'compact na'],
    ['not applicable', 'phrase not applicable'],
  ];

  for (const [input, label] of notApplicable) {
    it(`n/a: ${label}`, () => {
      assert.strictEqual(normalizeBoolean(input), 'n/a');
    });
  }

  const unrecognized = [
    ['maybe',      'maybe -> null'],
    ['sometimes',  'sometimes -> null'],
    ['perhaps',    'perhaps -> null'],
    [42,           'number -> null'],
    [['yes'],      'array -> null'],
  ];

  for (const [input, label] of unrecognized) {
    it(`null: ${label}`, () => {
      assert.strictEqual(normalizeBoolean(input), null);
    });
  }
});

describe('parseDate', () => {
  it('ISO date string → YYYY-MM-DD only (no timestamp)', () => {
    const result = parseDate('2024-10-01');
    assert.strictEqual(result, '2024-10-01');
  });

  it('Date object → YYYY-MM-DD only', () => {
    const result = parseDate(new Date('2024-10-01'));
    assert.strictEqual(result, '2024-10-01');
  });

  it('bare year → YYYY-01-01', () => {
    const result = parseDate('2024');
    assert.strictEqual(result, '2024-01-01');
  });

  it('year-month → YYYY-MM-01', () => {
    const result = parseDate('2024-10');
    assert.strictEqual(result, '2024-10-01');
  });

  it('unparseable string -> null', () => {
    assert.strictEqual(parseDate('not a date'), null);
  });

  it('empty string -> null', () => {
    assert.strictEqual(parseDate(''), null);
  });

  it('null -> null', () => {
    assert.strictEqual(parseDate(null), null);
  });
});
