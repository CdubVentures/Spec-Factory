import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nowIso,
  toPosix,
  normalizeCategory,
  normalizeFieldKey,
  normalizeToken,
  isObject,
  toArray,
  hasKnownValue,
  parseDateMs,
  toNumber,
  toInt,
  parsePeriodDays,
  parseJsonLines,
  coerceOutputValue,
  csvEscape
} from '../publishPrimitives.js';

test('nowIso returns ISO string', () => {
  const result = nowIso();
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result));
});

test('toPosix joins and normalizes path separators', () => {
  assert.equal(toPosix('a', 'b', 'c'), 'a/b/c');
  assert.equal(toPosix('a\\b', 'c'), 'a/b/c');
  assert.equal(toPosix('a//b', '', 'c'), 'a/b/c');
  assert.equal(toPosix(), '');
});

test('normalizeCategory strips special chars and lowercases', () => {
  assert.equal(normalizeCategory('Gaming Mouse'), 'gaming-mouse');
  assert.equal(normalizeCategory('  --FOO--  '), 'foo');
  assert.equal(normalizeCategory(''), '');
  assert.equal(normalizeCategory(null), '');
});

test('normalizeFieldKey strips fields. prefix and normalizes', () => {
  assert.equal(normalizeFieldKey('fields.weight_grams'), 'weight_grams');
  assert.equal(normalizeFieldKey('Weight Grams'), 'weight_grams');
  assert.equal(normalizeFieldKey('  __foo__  '), 'foo');
  assert.equal(normalizeFieldKey(''), '');
  assert.equal(normalizeFieldKey(null), '');
});

test('normalizeToken trims and lowercases', () => {
  assert.equal(normalizeToken('  FOO  '), 'foo');
  assert.equal(normalizeToken(null), '');
  assert.equal(normalizeToken(''), '');
});

test('isObject identifies plain objects', () => {
  assert.equal(isObject({}), true);
  assert.equal(isObject({ a: 1 }), true);
  assert.equal(isObject(null), false);
  assert.equal(isObject([]), false);
  assert.equal(isObject('string'), false);
  assert.equal(isObject(0), false);
});

test('toArray wraps non-arrays', () => {
  assert.deepEqual(toArray([1, 2]), [1, 2]);
  assert.deepEqual(toArray('not array'), []);
  assert.deepEqual(toArray(null), []);
  assert.deepEqual(toArray(undefined), []);
});

const hasKnownValueCases = [
  ['hello', true],
  ['unk', false],
  ['unknown', false],
  ['n/a', false],
  ['null', false],
  ['-', false],
  ['', false],
  [null, false],
  ['UNK', false],
  ['N/A', false],
  ['  -  ', false],
  ['valid', true],
  ['0', true],
  ['false', true]
];
for (const [input, expected] of hasKnownValueCases) {
  test(`hasKnownValue(${JSON.stringify(input)}) → ${expected}`, () => {
    assert.equal(!!hasKnownValue(input), expected);
  });
}

test('parseDateMs parses valid ISO dates', () => {
  const ms = parseDateMs('2024-01-15T00:00:00.000Z');
  assert.ok(ms > 0);
  assert.equal(ms, Date.parse('2024-01-15T00:00:00.000Z'));
});

test('parseDateMs returns 0 for invalid input', () => {
  assert.equal(parseDateMs('not-a-date'), 0);
  assert.equal(parseDateMs(null), 0);
  assert.equal(parseDateMs(''), 0);
});

test('toNumber parses floats with fallback', () => {
  assert.equal(toNumber('3.14'), 3.14);
  assert.equal(toNumber('abc', 42), 42);
  assert.equal(toNumber(null, 5), 5);
  assert.equal(toNumber(''), 0);
});

test('toInt parses integers with fallback', () => {
  assert.equal(toInt('42'), 42);
  assert.equal(toInt('3.9'), 3);
  assert.equal(toInt('abc', 7), 7);
  assert.equal(toInt(null, 0), 0);
});

const parsePeriodDaysCases = [
  ['week', 7],
  ['weekly', 7],
  ['7d', 7],
  ['month', 30],
  ['monthly', 30],
  ['30d', 30],
  ['14d', 14],
  ['90', 90],
  ['', 30],
  [null, 30],
  ['garbage', 30]
];
for (const [input, expected] of parsePeriodDaysCases) {
  test(`parsePeriodDays(${JSON.stringify(input)}) → ${expected}`, () => {
    assert.equal(parsePeriodDays(input), expected);
  });
}

test('parseJsonLines parses valid JSONL', () => {
  const text = '{"a":1}\n{"b":2}\n';
  const result = parseJsonLines(text);
  assert.deepEqual(result, [{ a: 1 }, { b: 2 }]);
});

test('parseJsonLines skips invalid and empty lines', () => {
  const text = '{"a":1}\nnot json\n\n{"b":2}';
  const result = parseJsonLines(text);
  assert.deepEqual(result, [{ a: 1 }, { b: 2 }]);
});

test('parseJsonLines handles empty input', () => {
  assert.deepEqual(parseJsonLines(''), []);
  assert.deepEqual(parseJsonLines(null), []);
});

const coerceOutputValueCases = [
  [null, 'unk'],
  [undefined, 'unk'],
  ['', 'unk'],
  ['  ', 'unk'],
  [42, 42],
  [true, true],
  [false, false],
  ['true', true],
  ['false', false],
  ['TRUE', true],
  ['3.14', 3.14],
  ['-7', -7],
  ['hello', 'hello'],
  [[1, 2], [1, 2]],
  [{ a: 1 }, { a: 1 }]
];
for (const [input, expected] of coerceOutputValueCases) {
  test(`coerceOutputValue(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, () => {
    assert.deepEqual(coerceOutputValue(input), expected);
  });
}

test('csvEscape leaves plain text unchanged', () => {
  assert.equal(csvEscape('hello'), 'hello');
});

test('csvEscape wraps text with commas', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
});

test('csvEscape escapes quotes', () => {
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
});

test('csvEscape wraps text with newlines', () => {
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('csvEscape handles null', () => {
  assert.equal(csvEscape(null), '');
});
