import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSourceDir, computePageContentHash, computeFileContentHash } from '../artifactPathResolver.js';

// --- resolveSourceDir ---

test('resolveSourceDir returns content-addressed path with 12-char hash', () => {
  const result = resolveSourceDir({
    category: 'mouse',
    productId: 'mouse-razer-viper',
    contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  });
  assert.equal(result, 'artifacts/mouse/mouse-razer-viper/sources/abcdef123456/');
});

test('resolveSourceDir strips sha256: prefix from hash', () => {
  const result = resolveSourceDir({
    category: 'keyboard',
    productId: 'kb-test',
    contentHash: 'sha256:deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd',
  });
  assert.equal(result, 'artifacts/keyboard/kb-test/sources/deadbeef0000/');
});

test('resolveSourceDir returns empty string for missing hash', () => {
  assert.equal(resolveSourceDir({ category: 'mouse', productId: 'test', contentHash: '' }), '');
  assert.equal(resolveSourceDir({ category: 'mouse', productId: 'test', contentHash: null }), '');
  assert.equal(resolveSourceDir({ category: 'mouse', productId: 'test' }), '');
});

test('resolveSourceDir returns empty string for missing category or productId', () => {
  assert.equal(resolveSourceDir({ category: '', productId: 'test', contentHash: 'abc123' }), '');
  assert.equal(resolveSourceDir({ category: 'mouse', productId: '', contentHash: 'abc123' }), '');
});

// --- computePageContentHash ---

test('computePageContentHash returns hex sha256 of string input', () => {
  const hash = computePageContentHash('<html>hello</html>');
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('computePageContentHash is deterministic', () => {
  const a = computePageContentHash('<html>test</html>');
  const b = computePageContentHash('<html>test</html>');
  assert.equal(a, b);
});

test('computePageContentHash returns empty string for empty input', () => {
  assert.equal(computePageContentHash(''), '');
  assert.equal(computePageContentHash(null), '');
  assert.equal(computePageContentHash(undefined), '');
});

// --- computeFileContentHash ---

test('computeFileContentHash returns hex sha256 of buffer', () => {
  const buf = Buffer.from('screenshot binary data');
  const hash = computeFileContentHash(buf);
  assert.equal(typeof hash, 'string');
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('computeFileContentHash returns empty string for null/empty buffer', () => {
  assert.equal(computeFileContentHash(null), '');
  assert.equal(computeFileContentHash(Buffer.alloc(0)), '');
});
