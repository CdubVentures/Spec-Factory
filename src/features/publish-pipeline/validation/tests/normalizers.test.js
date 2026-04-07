import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseList,
  normalizeBoolean,
  normalizeColorList,
  parseDate,
  parseLatencyList,
  parsePollingList,
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

  const unk = [
    ['unk',       'canonical unk'],
    ['unknown',   'verbose unknown'],
    ['n/a',       'not applicable'],
    ['',          'empty -> unk'],
    [null,        'null -> unk'],
    [undefined,   'undefined -> unk'],
  ];

  for (const [input, label] of unk) {
    it(`unk: ${label}`, () => {
      assert.strictEqual(normalizeBoolean(input), 'unk');
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

describe('normalizeColorList', () => {
  const cases = [
    ['Black, White, Red',  ['black', 'white', 'red'],  'split + lowercase'],
    ['black',              ['black'],                    'single'],
    ['Black, , White',     ['black', 'white'],           'filter blanks'],
    ['',                   [],                            'empty'],
    [null,                 [],                            'null'],
  ];

  for (const [input, expected, label] of cases) {
    it(label, () => {
      assert.deepStrictEqual(normalizeColorList(input), expected);
    });
  }

  it('array + lowercase', () => {
    assert.deepStrictEqual(normalizeColorList(['BLACK', 'white']), ['black', 'white']);
  });
});

describe('parseDate', () => {
  it('ISO date string', () => {
    const result = parseDate('2024-10-01');
    assert.ok(result);
    assert.ok(result.startsWith('2024-10-01'));
  });

  it('Date object', () => {
    const result = parseDate(new Date('2024-10-01'));
    assert.ok(result);
    assert.ok(result.startsWith('2024-10-01'));
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

describe('parseLatencyList', () => {
  it('standard: "1.1 wired, 1.3 wireless"', () => {
    const result = parseLatencyList('1.1 wired, 1.3 wireless');
    assert.deepStrictEqual(result, [
      { value: 1.1, mode: 'wired' },
      { value: 1.3, mode: 'wireless' },
    ]);
  });

  it('no mode -> default', () => {
    const result = parseLatencyList('2.5');
    assert.deepStrictEqual(result, [{ value: 2.5, mode: 'default' }]);
  });

  it('bluetooth mode', () => {
    const result = parseLatencyList('3.0 bluetooth');
    assert.deepStrictEqual(result, [{ value: 3.0, mode: 'bluetooth' }]);
  });

  it('2.4g mode', () => {
    const result = parseLatencyList('1.5 2.4g');
    assert.deepStrictEqual(result, [{ value: 1.5, mode: '2.4g' }]);
  });

  it('empty -> []', () => {
    assert.deepStrictEqual(parseLatencyList(''), []);
  });

  it('non-numeric -> []', () => {
    assert.deepStrictEqual(parseLatencyList('abc'), []);
  });
});

describe('parsePollingList', () => {
  it('standard: "125, 500, 1000" -> sorted desc', () => {
    assert.deepStrictEqual(parsePollingList('125, 500, 1000'), [1000, 500, 125]);
  });

  it('deduplicates', () => {
    assert.deepStrictEqual(parsePollingList('1000, 1000, 500'), [1000, 500]);
  });

  it('non-numeric filtered', () => {
    assert.deepStrictEqual(parsePollingList('abc'), []);
  });

  it('empty -> []', () => {
    assert.deepStrictEqual(parsePollingList(''), []);
  });

  it('mixed numeric and non-numeric', () => {
    assert.deepStrictEqual(parsePollingList('125, abc, 500'), [500, 125]);
  });
});
