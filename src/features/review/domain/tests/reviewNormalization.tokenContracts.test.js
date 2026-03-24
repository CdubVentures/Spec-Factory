import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePathToken,
  slugify,
  splitCandidateParts,
} from '../reviewNormalization.js';

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

test('splitCandidateParts splits comma-separated values, handles arrays recursively, and deduplicates', () => {
  const cases = [
    ['a, b, c', ['a', 'b', 'c']],
    ['single', ['single']],
    ['a, a, b', ['a', 'b']],
    ['', []],
    [null, []],
    [undefined, []],
    ['  ', []],
    [['a', 'b, c'], ['a', 'b', 'c']],
    [['a', 'a'], ['a']],
    [[], []],
    [[null, '', undefined], []],
    [['x', ['y', 'z']], ['x', 'y', 'z']],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(splitCandidateParts(input), expected);
  }
});

test('normalizePathToken creates safe path tokens and falls back to unknown by default', () => {
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
    [[''], 'unknown'],
    [[null], 'unknown'],
  ];
  for (const [args, expected] of cases) {
    assert.equal(normalizePathToken(...args), expected, `normalizePathToken(${JSON.stringify(args)})`);
  }
});
