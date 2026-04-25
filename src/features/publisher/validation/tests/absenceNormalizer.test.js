import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAbsence } from '../absenceNormalizer.js';

describe('normalizeAbsence — scalar', () => {
  const cases = [
    [null,              'scalar', null,    'null -> null'],
    [undefined,         'scalar', null,    'undefined -> null'],
    ['',                'scalar', null,    'empty string -> null'],
    ['N/A',             'scalar', null,    'N/A -> null'],
    ['n/a',             'scalar', null,    'n/a lowercase -> null'],
    ['unknown',         'scalar', null,    'unknown -> null'],
    ['Unknown',         'scalar', null,    'Unknown mixed case -> null'],
    ['unk',             'scalar', null,    'unk token -> null'],
    ['tbd',             'scalar', null,    'tbd -> null'],
    ['TBD',             'scalar', null,    'TBD uppercase -> null'],
    ['tba',             'scalar', null,    'tba -> null'],
    ['unspecified',     'scalar', null,    'unspecified -> null'],
    ['-',               'scalar', null,    'dash -> null'],
    ['\u2014',          'scalar', null,    'em-dash -> null'],
    ['\u2013',          'scalar', null,    'en-dash -> null'],
    ['not available',   'scalar', null,    'not available -> null'],
    ['not applicable',  'scalar', null,    'not applicable -> null'],
    ['  N/A  ',         'scalar', null,    'padded N/A -> null (trimmed)'],
    ['  ',              'scalar', null,    'whitespace only -> null'],
  ];

  for (const [input, shape, expected, label] of cases) {
    it(label, () => {
      assert.strictEqual(normalizeAbsence(input, shape), expected);
    });
  }
});

describe('normalizeAbsence — scalar non-absence passthrough', () => {
  const cases = [
    ['none',    'scalar', 'none',   '"none" is semantic, NOT absent'],
    [0,         'scalar', 0,        'zero is valid, NOT absent'],
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
    [['unk'],                       'list', [],         'filter unk sentinel element'],
    [['UNK'],                       'list', [],         'filter uppercase unk sentinel element'],
    [['black', 'unk', 'white'],     'list', ['black', 'white'], 'filter unk sentinel among real values'],
    [['none'],                      'list', ['none'],   '"none" is semantic in lists, NOT absent'],
    [['black', 'white'],            'list', ['black', 'white'], 'clean list passes through'],
    [[],                            'list', [],         'empty list passes through'],
  ];

  for (const [input, shape, expected, label] of cases) {
    it(label, () => {
      assert.deepStrictEqual(normalizeAbsence(input, shape), expected);
    });
  }
});

describe('normalizeAbsence — record shape retired', () => {
  it('null + record falls through to scalar default (null)', () => {
    assert.strictEqual(normalizeAbsence(null, 'record'), null);
  });
});
