import test from 'node:test';
import assert from 'node:assert/strict';
import { toInt, toFloat, toBool } from '../typeHelpers.js';
import {
  toInt as canonicalToInt,
  toFloat as canonicalToFloat,
} from '../../../../../shared/valueNormalizers.js';

test('toInt and toFloat are re-exports from valueNormalizers SSOT', () => {
  assert.equal(toInt, canonicalToInt, 'toInt should be the same reference as valueNormalizers.toInt');
  assert.equal(toFloat, canonicalToFloat, 'toFloat should be the same reference as valueNormalizers.toFloat');
});

// --- toInt ---

test('toInt parses valid integer string', () => {
  assert.equal(toInt('42'), 42);
  assert.equal(toInt('-7'), -7);
  assert.equal(toInt('0'), 0);
});

test('toInt returns fallback for non-numeric input', () => {
  assert.equal(toInt('abc', 5), 5);
  assert.equal(toInt(undefined, 10), 10);
  assert.equal(toInt(null, 3), 3);
  assert.equal(toInt('', 99), 99);
});

test('toInt returns 0 as default fallback', () => {
  assert.equal(toInt('not-a-number'), 0);
});

test('toInt handles numeric values directly', () => {
  assert.equal(toInt(100), 100);
  assert.equal(toInt(3.7), 3);
});

// --- toFloat ---

test('toFloat parses valid float string', () => {
  assert.equal(toFloat('3.14'), 3.14);
  assert.equal(toFloat('-2.5'), -2.5);
  assert.equal(toFloat('0'), 0);
});

test('toFloat returns fallback for non-numeric input', () => {
  assert.equal(toFloat('abc', 1.5), 1.5);
  assert.equal(toFloat(undefined, 9.9), 9.9);
  assert.equal(toFloat(null, 0.1), 0.1);
});

test('toFloat returns 0 as default fallback', () => {
  assert.equal(toFloat('not-a-number'), 0);
});

// --- toBool ---

test('toBool recognizes truthy string tokens', () => {
  assert.equal(toBool('1'), true);
  assert.equal(toBool('true'), true);
  assert.equal(toBool('yes'), true);
  assert.equal(toBool('on'), true);
  assert.equal(toBool('TRUE'), true);
  assert.equal(toBool('  Yes  '), true);
});

test('toBool returns false for non-truthy string tokens', () => {
  assert.equal(toBool('0'), false);
  assert.equal(toBool('false'), false);
  assert.equal(toBool('no'), false);
  assert.equal(toBool('off'), false);
  assert.equal(toBool('random'), false);
});

test('toBool returns fallback for null/undefined/empty', () => {
  assert.equal(toBool(undefined, true), true);
  assert.equal(toBool(null, true), true);
  assert.equal(toBool('', true), true);
  assert.equal(toBool(undefined), false);
});
