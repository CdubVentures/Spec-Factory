import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isObject,
  toArray,
  normalizeToken,
  normalizeFieldKey,
  normalizeField,
  slugify,
  splitCandidateParts,
  normalizePathToken,
  toNumber,
  parseDateMs,
} from '../reviewNormalization.js';

// ── isObject ────────────────────────────────────────────────────────

test('isObject returns true only for plain objects', () => {
  const cases = [
    [{ a: 1 }, true],
    [{}, true],
    [null, false],
    [undefined, false],
    [0, false],
    ['', false],
    [false, false],
    [[], false],
    [new Date(), true],
  ];
  for (const [input, expected] of cases) {
    assert.equal(isObject(input), expected, `isObject(${JSON.stringify(input)})`);
  }
});

// ── toArray ─────────────────────────────────────────────────────────

test('toArray wraps non-arrays and passes arrays through', () => {
  assert.deepEqual(toArray([1, 2]), [1, 2]);
  assert.deepEqual(toArray([]), []);
  assert.deepEqual(toArray(null), []);
  assert.deepEqual(toArray(undefined), []);
  assert.deepEqual(toArray('hello'), []);
  assert.deepEqual(toArray(0), []);
  assert.deepEqual(toArray({}), []);
});

// ── normalizeToken ──────────────────────────────────────────────────

test('normalizeToken trims, lowercases, and handles edge cases', () => {
  const cases = [
    ['Hello', 'hello'],
    ['  UPPER  ', 'upper'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    [0, '0'],
    [false, 'false'],
    ['Already-Lower', 'already-lower'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeToken(input), expected, `normalizeToken(${JSON.stringify(input)})`);
  }
});

// ── normalizeFieldKey ───────────────────────────────────────────────

test('normalizeFieldKey strips non-alphanumeric-underscore and trims underscores', () => {
  const cases = [
    ['dpi', 'dpi'],
    ['DPI', 'dpi'],
    ['click_latency', 'click_latency'],
    ['fields.weight', 'fields_weight'],
    ['  sensor  ', 'sensor'],
    ['a--b++c', 'a_b_c'],
    ['__leading__', 'leading'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['$special!chars@', 'special_chars'],
    ['hello world', 'hello_world'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeFieldKey(input), expected, `normalizeFieldKey(${JSON.stringify(input)})`);
  }
});

// ── normalizeField ──────────────────────────────────────────────────

test('normalizeField strips fields. prefix then normalizes', () => {
  const cases = [
    ['fields.weight', 'weight'],
    ['fields.click_latency', 'click_latency'],
    ['weight', 'weight'],
    ['FIELDS.DPI', 'dpi'],
    ['fields.DPI', 'dpi'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['fields.', ''],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeField(input), expected, `normalizeField(${JSON.stringify(input)})`);
  }
});

// ── slugify ─────────────────────────────────────────────────────────

test('slugify creates URL-safe slugs', () => {
  const cases = [
    ['Hello World', 'hello-world'],
    ['  Spaced  Out  ', 'spaced-out'],
    ['already-slugged', 'already-slugged'],
    ['special!@#$chars', 'special-chars'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['---leading---', 'leading'],
    ['UPPER_CASE', 'upper-case'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(slugify(input), expected, `slugify(${JSON.stringify(input)})`);
  }
});

// ── splitCandidateParts ─────────────────────────────────────────────

test('splitCandidateParts splits comma-separated values and deduplicates', () => {
  assert.deepEqual(splitCandidateParts('a, b, c'), ['a', 'b', 'c']);
  assert.deepEqual(splitCandidateParts('single'), ['single']);
  assert.deepEqual(splitCandidateParts('a, a, b'), ['a', 'b']);
  assert.deepEqual(splitCandidateParts(''), []);
  assert.deepEqual(splitCandidateParts(null), []);
  assert.deepEqual(splitCandidateParts(undefined), []);
  assert.deepEqual(splitCandidateParts('  '), []);
});

test('splitCandidateParts handles arrays recursively', () => {
  assert.deepEqual(splitCandidateParts(['a', 'b, c']), ['a', 'b', 'c']);
  assert.deepEqual(splitCandidateParts(['a', 'a']), ['a']);
  assert.deepEqual(splitCandidateParts([]), []);
  assert.deepEqual(splitCandidateParts([null, '', undefined]), []);
  assert.deepEqual(splitCandidateParts(['x', ['y', 'z']]), ['x', 'y', 'z']);
});

// ── normalizePathToken ──────────────────────────────────────────────

test('normalizePathToken creates safe path tokens with fallback', () => {
  const cases = [
    [['hello world', 'fallback'], 'hello-world'],
    [['Hello_World', 'fallback'], 'hello_world'],
    [['', 'unknown'], 'unknown'],
    [[null, 'unknown'], 'unknown'],
    [[undefined, 'unknown'], 'unknown'],
    [['  ', 'default'], 'default'],
    [['valid-token', 'x'], 'valid-token'],
    [['---', 'x'], 'x'],
    [['special!@#', 'x'], 'special'],
  ];
  for (const [args, expected] of cases) {
    assert.equal(normalizePathToken(...args), expected, `normalizePathToken(${JSON.stringify(args)})`);
  }
});

test('normalizePathToken uses default fallback when not specified', () => {
  assert.equal(normalizePathToken(''), 'unknown');
  assert.equal(normalizePathToken(null), 'unknown');
});

// ── toNumber ────────────────────────────────────────────────────────

test('toNumber parses floats with fallback', () => {
  const cases = [
    [['42', undefined], 42],
    [['3.14', undefined], 3.14],
    [['0', undefined], 0],
    [['-5.5', undefined], -5.5],
    [['', undefined], 0],
    [[null, undefined], 0],
    [[undefined, undefined], 0],
    [['abc', 99], 99],
    [['NaN', 99], 99],
    [['Infinity', undefined], 0],
    [['  7.5  ', undefined], 7.5],
    [[42, undefined], 42],
    [[0, undefined], 0],
  ];
  for (const [args, expected] of cases) {
    assert.equal(toNumber(args[0], args[1]), expected, `toNumber(${JSON.stringify(args[0])}, ${JSON.stringify(args[1])})`);
  }
});

// ── parseDateMs ─────────────────────────────────────────────────────

test('parseDateMs parses ISO dates to milliseconds with fallback', () => {
  assert.equal(parseDateMs('2025-01-15T12:00:00Z'), Date.parse('2025-01-15T12:00:00Z'));
  assert.equal(parseDateMs('2025-06-01'), Date.parse('2025-06-01'));
  assert.equal(parseDateMs(''), 0);
  assert.equal(parseDateMs(null), 0);
  assert.equal(parseDateMs(undefined), 0);
  assert.equal(parseDateMs('not-a-date'), 0);
  assert.equal(parseDateMs('  '), 0);
});
