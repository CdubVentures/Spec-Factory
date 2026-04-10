import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isUnknownToken,
  canonicalizeWhitespace,
  isValidIsoDateTime,
  safeJsonParse
} from '../engineTextHelpers.js';

// WHY: Primitives (isObject, toArray, normalizeText, normalizeToken, normalizeFieldKey)
// are now tested canonically in src/shared/tests/primitives.test.js.
// This file tests only the engine-specific functions.

// ── isUnknownToken ────────────────────────────────────────────────────────────

test('isUnknownToken identifies unknown-equivalent values', () => {
  const unknowns = ['unknown', 'N/A', 'n/a', '-', 'none', '', null, undefined];
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
  assert.equal(isUnknownToken({ value: null }), true);
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
