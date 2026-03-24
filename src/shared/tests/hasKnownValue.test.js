import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { hasKnownValue, UNKNOWN_VALUE_TOKENS } from '../valueNormalizers.js';

describe('hasKnownValue', () => {
  // WHY: Table-driven boundary tests for the canonical unknown-value gate.
  // Every pipeline stage, scoring module, and publish layer must agree on
  // what constitutes a "known" value. This test matrix IS the contract.

  const knownCases = [
    ['hello',         'normal string'],
    ['Intel Core i7', 'realistic product value'],
    ['0',             'numeric string zero'],
    [0,               'numeric zero'],
    [false,           'boolean false'],
    [true,            'boolean true'],
    ['  valid  ',     'whitespace-padded string'],
    ['some-value',    'hyphenated string'],
    ['N/A extra',     'n/a substring in longer string'],
  ];

  const unknownCases = [
    ['',          'empty string'],
    ['unk',       'standard sentinel'],
    ['UNK',       'upper-case sentinel'],
    [' Unk ',     'padded sentinel'],
    ['unknown',   'full word'],
    ['Unknown',   'mixed-case unknown'],
    ['UNKNOWN',   'upper-case unknown'],
    ['n/a',       'slash form'],
    ['N/A',       'upper slash form'],
    ['na',        'no-slash form'],
    ['NA',        'upper no-slash'],
    ['none',      'none'],
    ['None',      'mixed-case none'],
    ['NONE',      'upper none'],
    ['null',      'string null'],
    ['NULL',      'upper null'],
    ['undefined', 'string undefined'],
    ['Undefined', 'mixed-case undefined'],
    ['-',         'dash'],
    ['  -  ',     'padded dash'],
    [null,        'JS null'],
    [undefined,   'JS undefined'],
  ];

  for (const [input, label] of knownCases) {
    it(`returns true for known value: ${label} (${JSON.stringify(input)})`, () => {
      strictEqual(hasKnownValue(input), true);
    });
  }

  for (const [input, label] of unknownCases) {
    it(`returns false for unknown value: ${label} (${JSON.stringify(input)})`, () => {
      strictEqual(hasKnownValue(input), false);
    });
  }
});

describe('UNKNOWN_VALUE_TOKENS', () => {
  it('contains exactly 9 tokens', () => {
    strictEqual(UNKNOWN_VALUE_TOKENS.size, 9);
  });

  it('contains all expected tokens', () => {
    const expected = ['', 'unk', 'unknown', 'n/a', 'na', 'none', 'null', 'undefined', '-'];
    for (const token of expected) {
      ok(UNKNOWN_VALUE_TOKENS.has(token), `missing token: ${JSON.stringify(token)}`);
    }
  });

  it('is a Set', () => {
    ok(UNKNOWN_VALUE_TOKENS instanceof Set);
  });
});
