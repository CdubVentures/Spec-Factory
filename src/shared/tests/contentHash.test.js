import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { computePageContentHash, computeFileContentHash, sha256Hex, generateStableSnippetId } from '../contentHash.js';

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

// --- sha256Hex ---

describe('sha256Hex', () => {
  test('returns 64-char hex SHA-256 for string input', () => {
    const hash = sha256Hex('hello');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  test('is deterministic — same input produces same hash', () => {
    assert.equal(sha256Hex('test'), sha256Hex('test'));
  });

  test('different input produces different hash', () => {
    assert.notEqual(sha256Hex('aaa'), sha256Hex('bbb'));
  });

  test('returns empty string for empty input', () => {
    assert.equal(sha256Hex(''), '');
  });

  test('returns empty string for null', () => {
    assert.equal(sha256Hex(null), '');
  });

  test('returns empty string for undefined', () => {
    assert.equal(sha256Hex(undefined), '');
  });

  test('does NOT trim — whitespace-only input produces a hash', () => {
    const hash = sha256Hex('   ');
    assert.equal(hash.length, 64);
  });

  test('known value: sha256("hello") matches expected', () => {
    assert.equal(
      sha256Hex('hello'),
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

// --- generateStableSnippetId ---

describe('generateStableSnippetId', () => {
  test('returns sn_ prefixed 16-char hex slug', () => {
    const id = generateStableSnippetId({ contentHash: 'abc123', parserVersion: 'v1', chunkIndex: 0 });
    assert.match(id, /^sn_[0-9a-f]{16}$/);
  });

  test('is deterministic — same input produces same id', () => {
    const a = generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v1', chunkIndex: 0 });
    const b = generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v1', chunkIndex: 0 });
    assert.equal(a, b);
  });

  test('different inputs produce different ids', () => {
    const a = generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v1', chunkIndex: 0 });
    const b = generateStableSnippetId({ contentHash: 'abc', parserVersion: 'v1', chunkIndex: 1 });
    assert.notEqual(a, b);
  });

  test('handles null/undefined gracefully', () => {
    const id = generateStableSnippetId({ contentHash: null, parserVersion: undefined, chunkIndex: undefined });
    assert.match(id, /^sn_[0-9a-f]{16}$/);
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
