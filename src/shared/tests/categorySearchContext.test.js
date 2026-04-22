import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategorySearchContext } from '../categorySearchContext.js';

test('mouse → "gaming mouse"', () => {
  assert.equal(getCategorySearchContext('mouse'), 'gaming mouse');
});

test('keyboard → "gaming keyboard"', () => {
  assert.equal(getCategorySearchContext('keyboard'), 'gaming keyboard');
});

test('monitor → "gaming monitor"', () => {
  assert.equal(getCategorySearchContext('monitor'), 'gaming monitor');
});

test('headset → "gaming headset"', () => {
  assert.equal(getCategorySearchContext('headset'), 'gaming headset');
});

test('case-insensitive lookup', () => {
  assert.equal(getCategorySearchContext('MOUSE'), 'gaming mouse');
  assert.equal(getCategorySearchContext('Mouse'), 'gaming mouse');
});

test('unknown category returns empty string (no injection)', () => {
  assert.equal(getCategorySearchContext('widget'), '');
  assert.equal(getCategorySearchContext('speaker'), '');
});

test('empty / null / undefined input returns empty string', () => {
  assert.equal(getCategorySearchContext(''), '');
  assert.equal(getCategorySearchContext(null), '');
  assert.equal(getCategorySearchContext(undefined), '');
});

test('leading/trailing whitespace tolerated', () => {
  assert.equal(getCategorySearchContext('  mouse  '), 'gaming mouse');
});
