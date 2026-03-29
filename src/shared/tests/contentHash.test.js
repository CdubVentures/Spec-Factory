import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computePageContentHash, computeFileContentHash } from '../contentHash.js';

// --- computePageContentHash ---

describe('computePageContentHash', () => {
  test('returns 64-char hex SHA-256 for string input', () => {
    const hash = computePageContentHash('<html>hello</html>');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  test('is deterministic — same input produces same hash', () => {
    const a = computePageContentHash('<html>test</html>');
    const b = computePageContentHash('<html>test</html>');
    assert.equal(a, b);
  });

  test('different input produces different hash', () => {
    const a = computePageContentHash('<html>aaa</html>');
    const b = computePageContentHash('<html>bbb</html>');
    assert.notEqual(a, b);
  });

  test('returns empty string for empty input', () => {
    assert.equal(computePageContentHash(''), '');
  });

  test('returns empty string for null', () => {
    assert.equal(computePageContentHash(null), '');
  });

  test('returns empty string for undefined', () => {
    assert.equal(computePageContentHash(undefined), '');
  });

  test('returns empty string for whitespace-only input', () => {
    assert.equal(computePageContentHash('   '), '');
    assert.equal(computePageContentHash('\n\t'), '');
  });
});

// --- computeFileContentHash ---

describe('computeFileContentHash', () => {
  test('returns 64-char hex SHA-256 for Buffer input', () => {
    const buf = Buffer.from('binary data here');
    const hash = computeFileContentHash(buf);
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  test('is deterministic — same buffer produces same hash', () => {
    const a = computeFileContentHash(Buffer.from('same'));
    const b = computeFileContentHash(Buffer.from('same'));
    assert.equal(a, b);
  });

  test('different buffer produces different hash', () => {
    const a = computeFileContentHash(Buffer.from('aaa'));
    const b = computeFileContentHash(Buffer.from('bbb'));
    assert.notEqual(a, b);
  });

  test('returns empty string for null', () => {
    assert.equal(computeFileContentHash(null), '');
  });

  test('returns empty string for zero-length Buffer', () => {
    assert.equal(computeFileContentHash(Buffer.alloc(0)), '');
  });

  test('returns empty string for non-Buffer input', () => {
    assert.equal(computeFileContentHash('not a buffer'), '');
    assert.equal(computeFileContentHash(42), '');
  });
});
