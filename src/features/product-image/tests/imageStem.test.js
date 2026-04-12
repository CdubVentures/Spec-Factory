import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { imageStem, maxDedupN } from '../productImageFinder.js';

/* ── imageStem ─────────────────────────────────────────────────────── */

describe('imageStem', () => {
  const cases = [
    ['top-black.png', 'top-black'],
    ['top-black.jpg', 'top-black'],
    ['top-black-2.png', 'top-black-2'],
    ['angle-glacier-blue-3.webp', 'angle-glacier-blue-3'],
    ['hero-cod-bo6-edition.avif', 'hero-cod-bo6-edition'],
    ['no-extension', 'no-extension'],
    ['', ''],
    [undefined, ''],
    [null, ''],
  ];

  for (const [input, expected] of cases) {
    it(`imageStem(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, () => {
      assert.equal(imageStem(input), expected);
    });
  }
});

/* ── maxDedupN ─────────────────────────────────────────────────────── */

describe('maxDedupN', () => {
  it('returns 1 for a single file with no suffix', () => {
    assert.equal(maxDedupN('top-black', ['top-black.png']), 1);
  });

  it('returns 2 for a single file with -2 suffix', () => {
    assert.equal(maxDedupN('top-black', ['top-black-2.png']), 2);
  });

  it('returns highest N across gap (1 and 3, missing 2)', () => {
    assert.equal(maxDedupN('top-black', ['top-black.png', 'top-black-3.png']), 3);
  });

  it('returns 0 for empty file list', () => {
    assert.equal(maxDedupN('top-black', []), 0);
  });

  it('returns 0 when no files match prefix', () => {
    assert.equal(maxDedupN('top-black', ['left-black.png', 'front-red.jpg']), 0);
  });

  it('handles variant slug with trailing number (top-glacier-2)', () => {
    // "top-glacier-2" is the variant prefix, not a dedup suffix
    assert.equal(maxDedupN('top-glacier-2', ['top-glacier-2.png']), 1);
  });

  it('handles variant slug with trailing number and dedup suffix', () => {
    assert.equal(maxDedupN('top-glacier-2', ['top-glacier-2.png', 'top-glacier-2-3.png']), 3);
  });

  it('ignores files with different extensions but same prefix', () => {
    // Both share the stem — should pick the highest N across extensions
    assert.equal(maxDedupN('top-black', ['top-black.jpg', 'top-black.png']), 1);
  });

  it('handles mixed extensions with dedup suffixes', () => {
    assert.equal(
      maxDedupN('top-black', ['top-black.jpg', 'top-black-2.png', 'top-black-3.webp']),
      3,
    );
  });

  it('ignores non-numeric suffix after prefix-', () => {
    // "top-black-extra.png" has NaN suffix — should be ignored
    assert.equal(maxDedupN('top-black', ['top-black-extra.png']), 0);
  });
});
