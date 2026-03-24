import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { isObject, toArray, normalizeText, normalizeToken, normalizeFieldKey } from '../primitives.js';

describe('isObject', () => {
  const trueCases = [
    [{},              'empty plain object'],
    [{ a: 1 },        'object with properties'],
    [new Date(),      'Date instance'],
    [/regex/,         'RegExp instance'],
    [Object.create(null), 'null-prototype object'],
  ];

  const falseCases = [
    [null,      'null'],
    [undefined, 'undefined'],
    [0,         'numeric zero'],
    [42,        'positive number'],
    ['',        'empty string'],
    ['hello',   'non-empty string'],
    [false,     'boolean false'],
    [true,      'boolean true'],
    [[],        'empty array'],
    [[1, 2],    'array with items'],
  ];

  for (const [input, label] of trueCases) {
    it(`returns true for: ${label}`, () => {
      strictEqual(isObject(input), true);
    });
  }

  for (const [input, label] of falseCases) {
    it(`returns false for: ${label}`, () => {
      strictEqual(isObject(input), false);
    });
  }
});

describe('toArray', () => {
  it('returns the same array for array input', () => {
    const arr = [1, 2, 3];
    strictEqual(toArray(arr), arr);
  });

  it('returns empty array for empty array input', () => {
    const arr = [];
    strictEqual(toArray(arr), arr);
  });

  const emptyReturnCases = [
    [null,      'null'],
    [undefined, 'undefined'],
    [0,         'numeric zero'],
    ['hello',   'string'],
    [42,        'number'],
    [{},        'plain object'],
    [false,     'boolean false'],
    [true,      'boolean true'],
  ];

  for (const [input, label] of emptyReturnCases) {
    it(`returns [] for non-array: ${label}`, () => {
      deepStrictEqual(toArray(input), []);
    });
  }
});

describe('normalizeText', () => {
  const cases = [
    ['  hello  ',    'hello',    'trims whitespace'],
    [' a  b ',       'a  b',    'preserves inner whitespace'],
    [null,           '',         'null → empty string'],
    [undefined,      '',         'undefined → empty string'],
    [42,             '42',       'numeric coercion'],
    ['',             '',         'empty string passthrough'],
    ['\t\n  hi  \n', 'hi',      'trims tabs and newlines'],
    [0,              '0',        'numeric zero preserved via ??'],
    [false,          'false',    'boolean false preserved via ??'],
  ];

  for (const [input, expected, label] of cases) {
    it(label, () => {
      strictEqual(normalizeText(input), expected);
    });
  }
});

describe('normalizeToken', () => {
  const cases = [
    ['  Hello World  ', 'hello world', 'trims and lowercases'],
    [null,              '',            'null → empty string'],
    [undefined,         '',            'undefined → empty string'],
    ['UPPER',           'upper',       'lowercases'],
    ['already',         'already',     'no-op for lowercase trimmed'],
    ['  MiXeD  ',       'mixed',       'mixed case with whitespace'],
    ['',                '',            'empty string passthrough'],
  ];

  for (const [input, expected, label] of cases) {
    it(label, () => {
      strictEqual(normalizeToken(input), expected);
    });
  }
});

describe('normalizeFieldKey', () => {
  const cases = [
    ['Battery Hours',   'battery_hours',  'spaces → underscore, lowercased'],
    ['  Max DPI  ',     'max_dpi',        'trimmed, spaces → underscore'],
    ['foo--bar',        'foo_bar',        'consecutive non-alnum → single underscore'],
    ['__leading__',     'leading',        'strips leading/trailing underscores'],
    [null,              '',               'null → empty string'],
    [undefined,         '',               'undefined → empty string'],
    ['',                '',               'empty string passthrough'],
    ['already_valid',   'already_valid',  'already normalized passthrough'],
    ['CamelCase',       'camelcase',      'lowercased'],
    ['a.b.c',           'a_b_c',          'dots → underscores'],
    ['_trim_',          'trim',           'leading/trailing underscores stripped'],
    ['123numeric',      '123numeric',     'leading digits preserved'],
  ];

  for (const [input, expected, label] of cases) {
    it(label, () => {
      strictEqual(normalizeFieldKey(input), expected);
    });
  }
});
