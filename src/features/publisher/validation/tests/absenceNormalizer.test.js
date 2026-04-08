import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAbsence } from '../absenceNormalizer.js';

describe('normalizeAbsence — scalar', () => {
  const cases = [
    [null,              'scalar', 'unk',    'null -> unk'],
    [undefined,         'scalar', 'unk',    'undefined -> unk'],
    ['',                'scalar', 'unk',    'empty string -> unk'],
    ['N/A',             'scalar', 'unk',    'N/A -> unk'],
    ['n/a',             'scalar', 'unk',    'n/a lowercase -> unk'],
    ['unknown',         'scalar', 'unk',    'unknown -> unk'],
    ['Unknown',         'scalar', 'unk',    'Unknown mixed case -> unk'],
    ['unk',             'scalar', 'unk',    'unk token -> unk'],
    ['tbd',             'scalar', 'unk',    'tbd -> unk'],
    ['TBD',             'scalar', 'unk',    'TBD uppercase -> unk'],
    ['tba',             'scalar', 'unk',    'tba -> unk'],
    ['unspecified',     'scalar', 'unk',    'unspecified -> unk'],
    ['-',               'scalar', 'unk',    'dash -> unk'],
    ['\u2014',          'scalar', 'unk',    'em-dash -> unk'],
    ['\u2013',          'scalar', 'unk',    'en-dash -> unk'],
    ['not available',   'scalar', 'unk',    'not available -> unk'],
    ['not applicable',  'scalar', 'unk',    'not applicable -> unk'],
    ['  N/A  ',         'scalar', 'unk',    'padded N/A -> unk (trimmed)'],
    ['  ',              'scalar', 'unk',    'whitespace only -> unk'],
  ];

  for (const [input, shape, expected, label] of cases) {
    it(label, () => {
      assert.strictEqual(normalizeAbsence(input, shape), expected);
    });
  }
});

describe('normalizeAbsence — scalar non-absence passthrough', () => {
  const cases = [
    ['none',    'scalar', 'none',   '"none" is semantic, NOT unk'],
    [0,         'scalar', 0,        'zero is valid, NOT unk'],
    [false,     'scalar', false,    'boolean false passes through'],
    ['black',   'scalar', 'black',  'normal string passes through'],
    [42,        'scalar', 42,       'number passes through'],
    ['hello',   'scalar', 'hello',  'regular string passes through'],
  ];

  for (const [input, shape, expected, label] of cases) {
    it(label, () => {
      assert.strictEqual(normalizeAbsence(input, shape), expected);
    });
  }
});

describe('normalizeAbsence — list', () => {
  const cases = [
    [null,                          'list', [],         'null + list -> []'],
    [undefined,                     'list', [],         'undefined + list -> []'],
    [[null, 'black', ''],           'list', ['black'],  'filter null and empty elements'],
    [['a', null, undefined, '', 'b'], 'list', ['a', 'b'], 'deep filter preserves order'],
    [['black', 'white'],            'list', ['black', 'white'], 'clean list passes through'],
    [[],                            'list', [],         'empty list passes through'],
  ];

  for (const [input, shape, expected, label] of cases) {
    it(label, () => {
      assert.deepStrictEqual(normalizeAbsence(input, shape), expected);
    });
  }
});

describe('normalizeAbsence — record', () => {
  const cases = [
    [null,        'record', {},       'null + record -> {}'],
    [undefined,   'record', {},       'undefined + record -> {}'],
    [{},          'record', {},       'empty record passes through'],
    [{ a: 1 },   'record', { a: 1 }, 'non-empty record passes through'],
  ];

  for (const [input, shape, expected, label] of cases) {
    it(label, () => {
      assert.deepStrictEqual(normalizeAbsence(input, shape), expected);
    });
  }
});
