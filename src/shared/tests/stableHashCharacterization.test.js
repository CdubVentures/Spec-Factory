import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { stableHashString } from '../stableHash.js';

// WHY: Lock down hash determinism before replacing inlined copies.

describe('stableHashString characterization', () => {
  it('returns a string', () => {
    assert.equal(typeof stableHashString('hello'), 'string');
  });

  it('returns empty-string hash for empty input', () => {
    const h = stableHashString('');
    assert.equal(typeof h, 'string');
    assert.equal(h, '0');
  });

  it('returns stable output for known inputs', () => {
    const a = stableHashString('hello');
    const b = stableHashString('hello');
    assert.equal(a, b);
  });

  it('produces different hashes for different inputs', () => {
    const a = stableHashString('hello');
    const b = stableHashString('world');
    assert.notEqual(a, b);
  });

  it('handles null and undefined gracefully', () => {
    assert.equal(stableHashString(null), '0');
    assert.equal(stableHashString(undefined), '0');
  });

  it('matches the inline algorithm output for a product query', () => {
    // Replicate the exact inline algorithm to verify byte-for-byte parity
    function inlineHash(value) {
      const text = String(value || '');
      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      return Math.abs(hash).toString(36);
    }
    const inputs = [
      'hello',
      'Logitech G Pro X Superlight 2',
      'prod123::logitech g pro x superlight 2 specifications',
      '',
    ];
    for (const input of inputs) {
      assert.equal(stableHashString(input), inlineHash(input), `mismatch for: ${input}`);
    }
  });
});
