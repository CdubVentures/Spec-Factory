import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductId } from '../primitives.js';

describe('buildProductId', () => {
  test('returns {category}-{8-char-hex} format', () => {
    const id = buildProductId('mouse');
    assert.match(id, /^mouse-[a-f0-9]{8}$/);
  });

  test('slugifies category (lowercase, non-alnum to hyphen)', () => {
    const id = buildProductId('Gaming Mice');
    assert.match(id, /^gaming-mice-[a-f0-9]{8}$/);
  });

  test('strips leading/trailing hyphens from category', () => {
    const id = buildProductId('--mouse--');
    assert.match(id, /^mouse-[a-f0-9]{8}$/);
  });

  test('two calls produce different IDs (uniqueness)', () => {
    const a = buildProductId('mouse');
    const b = buildProductId('mouse');
    assert.notEqual(a, b);
  });

  test('throws for empty category', () => {
    assert.throws(() => buildProductId(''), /non-empty category/);
  });

  test('throws for null category', () => {
    assert.throws(() => buildProductId(null), /non-empty category/);
  });

  test('throws for undefined category', () => {
    assert.throws(() => buildProductId(undefined), /non-empty category/);
  });

  test('throws for whitespace-only category', () => {
    assert.throws(() => buildProductId('   '), /non-empty category/);
  });

  test('result length is category_slug + 1 + 8', () => {
    const id = buildProductId('keyboard');
    assert.equal(id.length, 'keyboard'.length + 1 + 8);
  });
});
