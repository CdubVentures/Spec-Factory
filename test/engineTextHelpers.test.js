import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isObject,
  toArray,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  isUnknownToken,
  canonicalizeWhitespace,
  isValidIsoDateTime,
  safeJsonParse
} from '../src/engine/engineTextHelpers.js';

// ── isObject ──────────────────────────────────────────────────────────────────

test('isObject returns true for plain objects', () => {
  assert.equal(isObject({}), true);
  assert.equal(isObject({ a: 1 }), true);
});

test('isObject returns false for non-objects', () => {
  const cases = [null, undefined, 0, '', false, [], [1], 'string', 42, true];
  for (const input of cases) {
    assert.equal(isObject(input), false, `expected false for ${JSON.stringify(input)}`);
  }
});

// ── toArray ───────────────────────────────────────────────────────────────────

test('toArray returns the array unchanged when given an array', () => {
  const arr = [1, 2, 3];
  assert.equal(toArray(arr), arr);
});

test('toArray returns empty array for non-array inputs', () => {
  const cases = [null, undefined, 0, '', false, {}, 'string', 42];
  for (const input of cases) {
    assert.deepEqual(toArray(input), [], `expected [] for ${JSON.stringify(input)}`);
  }
});

// ── normalizeText ─────────────────────────────────────────────────────────────

test('normalizeText trims whitespace and stringifies', () => {
  assert.equal(normalizeText('  hello  '), 'hello');
  assert.equal(normalizeText(42), '42');
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
});

// ── normalizeToken ────────────────────────────────────────────────────────────

test('normalizeToken lowercases and trims', () => {
  assert.equal(normalizeToken('  Hello World  '), 'hello world');
  assert.equal(normalizeToken(null), '');
  assert.equal(normalizeToken(undefined), '');
  assert.equal(normalizeToken(0), '0');
});

// ── normalizeFieldKey ─────────────────────────────────────────────────────────

test('normalizeFieldKey converts to snake_case token', () => {
  assert.equal(normalizeFieldKey('Battery Hours'), 'battery_hours');
  assert.equal(normalizeFieldKey('  Max DPI  '), 'max_dpi');
  assert.equal(normalizeFieldKey('foo--bar__baz'), 'foo_bar_baz');
  assert.equal(normalizeFieldKey(''), '');
  assert.equal(normalizeFieldKey(null), '');
  assert.equal(normalizeFieldKey(undefined), '');
});

// ── isUnknownToken ────────────────────────────────────────────────────────────

test('isUnknownToken identifies unknown-equivalent values', () => {
  const unknowns = ['unk', 'unknown', 'UNK', 'N/A', 'n/a', '-', 'none', '', null, undefined];
  for (const input of unknowns) {
    assert.equal(isUnknownToken(input), true, `expected true for ${JSON.stringify(input)}`);
  }
});

test('isUnknownToken returns false for meaningful values', () => {
  const meaningful = ['PAW3395', 'wireless', '42', 'wired'];
  for (const input of meaningful) {
    assert.equal(isUnknownToken(input), false, `expected false for ${JSON.stringify(input)}`);
  }
});

test('isUnknownToken recursively checks .value property on objects', () => {
  assert.equal(isUnknownToken({ value: 'unk' }), true);
  assert.equal(isUnknownToken({ value: 'PAW3395' }), false);
  assert.equal(isUnknownToken({ value: { value: 'unknown' } }), true);
});

// ── canonicalizeWhitespace ────────────────────────────────────────────────────

test('canonicalizeWhitespace collapses runs of whitespace to single space', () => {
  assert.equal(canonicalizeWhitespace('hello   world'), 'hello world');
  assert.equal(canonicalizeWhitespace('  leading  and  trailing  '), 'leading and trailing');
  assert.equal(canonicalizeWhitespace('\t\nnewlines\nand\ttabs'), 'newlines and tabs');
  assert.equal(canonicalizeWhitespace(null), '');
  assert.equal(canonicalizeWhitespace(undefined), '');
});

// ── isValidIsoDateTime ────────────────────────────────────────────────────────

test('isValidIsoDateTime accepts valid ISO datetimes', () => {
  assert.equal(isValidIsoDateTime('2026-02-12T10:30:00Z'), true);
  assert.equal(isValidIsoDateTime('2025-01-01T00:00:00.000Z'), true);
});

test('isValidIsoDateTime rejects non-ISO or invalid strings', () => {
  assert.equal(isValidIsoDateTime('2026-02-12'), false);
  assert.equal(isValidIsoDateTime('not a date'), false);
  assert.equal(isValidIsoDateTime(''), false);
  assert.equal(isValidIsoDateTime(null), false);
  assert.equal(isValidIsoDateTime(undefined), false);
});

// ── safeJsonParse ─────────────────────────────────────────────────────────────

test('safeJsonParse parses valid JSON', () => {
  assert.deepEqual(safeJsonParse('{"a":1}'), { a: 1 });
  assert.deepEqual(safeJsonParse('[1,2]'), [1, 2]);
  assert.equal(safeJsonParse('"hello"'), 'hello');
});

test('safeJsonParse returns null for invalid JSON', () => {
  assert.equal(safeJsonParse('not json'), null);
  assert.equal(safeJsonParse(''), null);
  assert.equal(safeJsonParse(null), null);
  assert.equal(safeJsonParse(undefined), null);
});
