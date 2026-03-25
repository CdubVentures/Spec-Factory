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

  it('returns compact lowercase base-36 hashes for representative inputs', () => {
    const inputs = [
      'hello',
      'Logitech G Pro X Superlight 2',
      'prod123::logitech g pro x superlight 2 specifications',
      '',
    ];
    for (const input of inputs) {
      const hash = stableHashString(input);
      assert.match(hash, /^[0-9a-z]+$/);
    }
  });
});
