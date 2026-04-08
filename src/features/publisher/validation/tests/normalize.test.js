import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeValue, applyTokenMap } from '../checks/normalize.js';

describe('applyTokenMap', () => {
  const cases = [
    ['grey',  { grey: 'gray' },  'gray',   'match -> mapped'],
    ['black', { grey: 'gray' },  'black',  'no match -> passthrough'],
    ['grey',  null,              'grey',   'null map -> passthrough'],
    ['grey',  {},                'grey',   'empty map -> passthrough'],
    ['grey',  undefined,         'grey',   'undefined map -> passthrough'],
  ];

  for (const [value, map, expected, label] of cases) {
    it(label, () => {
      assert.strictEqual(applyTokenMap(value, map), expected);
    });
  }
});

describe('normalizeValue — chain', () => {
  const cases = [
    ['  Black  ',       {},                                  'black',        'trim + lowercase'],
    ['DARK GREEN',      {},                                  'dark-green',   'spaces -> hyphens'],
    ['Light_Blue',      {},                                  'light-blue',   'underscores -> hyphens'],
    ['grey',            { grey: 'gray' },                    'gray',         'token_map applied'],
    ['blue-dark',       { 'blue-dark': 'dark-blue' },        'dark-blue',    'token_map swap'],
    ['  --hello--  ',   {},                                  'hello',        'collapse + trim hyphens'],
    ['a__b',            {},                                  'a-b',          'underscores + collapse'],
    ['Launch Edition',  {},                                  'launch-edition', 'multi-word kebab'],
    ['',                {},                                  '',             'empty string stays empty'],
  ];

  for (const [raw, tokenMap, expected, label] of cases) {
    it(label, () => {
      const fieldRule = { parse: { token_map: tokenMap } };
      assert.strictEqual(normalizeValue(raw, fieldRule), expected);
    });
  }
});

describe('normalizeValue — non-string passthrough', () => {
  const cases = [
    [42,      'number passthrough'],
    [null,    'null passthrough'],
    [true,    'boolean passthrough'],
    [undefined, 'undefined passthrough'],
  ];

  for (const [value, label] of cases) {
    it(label, () => {
      assert.strictEqual(normalizeValue(value, {}), value);
    });
  }

  it('array passthrough', () => {
    const arr = ['a'];
    assert.deepStrictEqual(normalizeValue(arr, {}), arr);
  });
});

describe('normalizeValue — multi-part + split', () => {
  const cases = [
    ['Grey+Red',           { grey: 'gray' },                                       'gray+red',        'split on +, normalize each, rejoin'],
    ['blue-dark + grey',   { 'blue-dark': 'dark-blue', grey: 'gray' },             'dark-blue+gray',  'trim atoms, token_map each'],
    ['black+white',        {},                                                       'black+white',     'no token_map, still normalizes'],
    ['BLACK+WHITE',        {},                                                       'black+white',     'uppercase atoms lowercased'],
    ['BLACK',              {},                                                       'black',           'no + present, normal chain'],
  ];

  for (const [raw, tokenMap, expected, label] of cases) {
    it(label, () => {
      const fieldRule = { parse: { token_map: tokenMap } };
      assert.strictEqual(normalizeValue(raw, fieldRule), expected);
    });
  }
});

describe('normalizeValue — fieldRule edge cases', () => {
  it('null fieldRule', () => {
    assert.strictEqual(normalizeValue('BLACK', null), 'black');
  });

  it('undefined fieldRule', () => {
    assert.strictEqual(normalizeValue('BLACK', undefined), 'black');
  });

  it('fieldRule without parse', () => {
    assert.strictEqual(normalizeValue('BLACK', {}), 'black');
  });

  it('fieldRule with parse but no token_map', () => {
    assert.strictEqual(normalizeValue('BLACK', { parse: {} }), 'black');
  });
});
