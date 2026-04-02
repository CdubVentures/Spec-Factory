import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidColorName, isValidHex, normalizeColorName } from '../utils/colorValidation.ts';

describe('isValidColorName', () => {
  it('accepts simple names', () => {
    assert.equal(isValidColorName('red'), true);
    assert.equal(isValidColorName('blue'), true);
    assert.equal(isValidColorName('gray'), true);
  });

  it('accepts hyphenated names', () => {
    assert.equal(isValidColorName('light-blue'), true);
    assert.equal(isValidColorName('dark-green'), true);
    assert.equal(isValidColorName('light-gray'), true);
  });

  it('accepts names with digits', () => {
    assert.equal(isValidColorName('gray50'), true);
  });

  it('rejects uppercase', () => {
    assert.equal(isValidColorName('Red'), false);
    assert.equal(isValidColorName('Light-Blue'), false);
  });

  it('rejects spaces', () => {
    assert.equal(isValidColorName('light blue'), false);
    assert.equal(isValidColorName('red blue'), false);
  });

  it('rejects names starting with digit', () => {
    assert.equal(isValidColorName('123'), false);
    assert.equal(isValidColorName('1red'), false);
  });

  it('rejects empty string', () => {
    assert.equal(isValidColorName(''), false);
  });

  it('rejects underscores', () => {
    assert.equal(isValidColorName('red_blue'), false);
  });
});

describe('isValidHex', () => {
  it('accepts valid 6-digit hex with #', () => {
    assert.equal(isValidHex('#000000'), true);
    assert.equal(isValidHex('#ffffff'), true);
    assert.equal(isValidHex('#ef4444'), true);
    assert.equal(isValidHex('#3B82F6'), true);
  });

  it('rejects without #', () => {
    assert.equal(isValidHex('000000'), false);
  });

  it('rejects 3-digit shorthand', () => {
    assert.equal(isValidHex('#fff'), false);
  });

  it('rejects invalid characters', () => {
    assert.equal(isValidHex('#gggggg'), false);
  });

  it('rejects empty', () => {
    assert.equal(isValidHex(''), false);
  });
});

describe('normalizeColorName', () => {
  it('lowercases', () => {
    assert.equal(normalizeColorName('Light-Blue'), 'light-blue');
  });

  it('replaces spaces with hyphens', () => {
    assert.equal(normalizeColorName('light blue'), 'light-blue');
    assert.equal(normalizeColorName('dark green'), 'dark-green');
  });

  it('collapses multiple spaces into single hyphen', () => {
    assert.equal(normalizeColorName('light  blue'), 'light-blue');
  });

  it('returns empty for empty', () => {
    assert.equal(normalizeColorName(''), '');
  });
});
