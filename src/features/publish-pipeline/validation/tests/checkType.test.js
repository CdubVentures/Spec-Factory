import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkType } from '../checks/checkType.js';

describe('checkType — string expected', () => {
  const cases = [
    ['black',   'string', true,  undefined, undefined,          '"black" -> pass'],
    ['',        'string', true,  undefined, undefined,          'empty string -> pass'],
    ['unk',     'string', true,  undefined, undefined,          'unk string -> pass'],
    [42,        'string', true,  '42',      'number_to_string', '42 -> repair "42"'],
    [0,         'string', true,  '0',       'number_to_string', '0 -> repair "0"'],
    [3.14,      'string', true,  '3.14',    'number_to_string', '3.14 -> repair "3.14"'],
    [true,      'string', true,  'yes',     'bool_to_string',   'true -> repair "yes"'],
    [false,     'string', true,  'no',      'bool_to_string',   'false -> repair "no"'],
    [null,      'string', false, undefined, undefined,          'null -> reject'],
    [[1, 2],    'string', false, undefined, undefined,          'array -> reject'],
    [{ a: 1 },  'string', false, undefined, undefined,          'object -> reject'],
  ];

  for (const [value, type, pass, repaired, rule, label] of cases) {
    it(label, () => {
      const r = checkType(value, type);
      assert.equal(r.pass, pass, `pass mismatch for: ${label}`);
      if (repaired !== undefined) assert.strictEqual(r.repaired, repaired);
      if (rule !== undefined) assert.equal(r.rule, rule);
      if (!pass) assert.equal(typeof r.reason, 'string');
    });
  }
});

describe('checkType — number expected', () => {
  const cases = [
    [42,         'number', true,  undefined, undefined,          '42 -> pass'],
    [42.5,       'number', true,  undefined, undefined,          '42.5 -> pass'],
    [0,          'number', true,  undefined, undefined,          '0 -> pass'],
    [-5,         'number', true,  undefined, undefined,          '-5 -> pass'],
    [-3.2,       'number', true,  undefined, undefined,          '-3.2 -> pass'],
    ['42',       'number', true,  42,        'string_to_number', '"42" -> repair 42'],
    ['42.5',     'number', true,  42.5,      'string_to_number', '"42.5" -> repair 42.5'],
    ['42.5g',    'number', true,  42.5,      'string_to_number', '"42.5g" -> repair 42.5'],
    ['120 mm',   'number', true,  120,       'string_to_number', '"120 mm" -> repair 120'],
    ['0',        'number', true,  0,         'string_to_number', '"0" -> repair 0'],
    ['-5',       'number', true,  -5,        'string_to_number', '"-5" -> repair -5'],
    ['unk',      'number', true,  'unk',     'unk_token',        '"unk" -> unk token passthrough'],
    ['N/A',      'number', true,  'unk',     'unk_token',        '"N/A" -> unk token passthrough'],
    ['n/a',      'number', true,  'unk',     'unk_token',        '"n/a" -> unk token passthrough'],
    ['',         'number', true,  'unk',     'unk_token',        'empty string -> unk token passthrough'],
    ['unknown',  'number', true,  'unk',     'unk_token',        '"unknown" -> unk token passthrough'],
    ['tbd',      'number', true,  'unk',     'unk_token',        '"tbd" -> unk token passthrough'],
    ['Unknown',  'number', true,  'unk',     'unk_token',        '"Unknown" -> unk token passthrough'],
    [NaN,        'number', false, undefined, undefined,          'NaN -> reject'],
    [Infinity,   'number', false, undefined, undefined,          'Infinity -> reject'],
    [-Infinity,  'number', false, undefined, undefined,          '-Infinity -> reject'],
    ['twenty',   'number', false, undefined, undefined,          '"twenty" -> reject (non-numeric)'],
    ['abc',      'number', false, undefined, undefined,          '"abc" -> reject (non-numeric)'],
    [null,       'number', false, undefined, undefined,          'null -> reject'],
    [true,       'number', false, undefined, undefined,          'true -> reject (bool not coercible to number)'],
    [false,      'number', false, undefined, undefined,          'false -> reject (bool not coercible to number)'],
    [[1],        'number', false, undefined, undefined,          'array -> reject'],
    [{ a: 1 },   'number', false, undefined, undefined,          'object -> reject'],
  ];

  for (const [value, type, pass, repaired, rule, label] of cases) {
    it(label, () => {
      const r = checkType(value, type);
      assert.equal(r.pass, pass, `pass mismatch for: ${label}`);
      if (repaired !== undefined) assert.strictEqual(r.repaired, repaired);
      if (rule !== undefined) assert.equal(r.rule, rule);
      if (!pass) assert.equal(typeof r.reason, 'string');
    });
  }
});

describe('checkType — unsupported type', () => {
  it('rejects gracefully for unrecognized type', () => {
    const r = checkType('hello', 'boolean');
    assert.equal(r.pass, false);
    assert.ok(r.reason.includes('unsupported'));
  });

  it('rejects gracefully for undefined type', () => {
    const r = checkType('hello', undefined);
    assert.equal(r.pass, false);
  });
});
