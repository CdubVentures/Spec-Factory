import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveHasRun } from '../reviewGridData.js';

describe('deriveHasRun', () => {
  it('true when product has any candidate', () => {
    assert.equal(deriveHasRun({ candidateCount: 1, knownFieldStateCount: 0 }), true);
    assert.equal(deriveHasRun({ candidateCount: 5, knownFieldStateCount: 0 }), true);
  });

  it('true when product has no candidates but has at least one known published field', () => {
    // WHY: this is the CEF post-delete-all-runs scenario — candidates stripped,
    // variants + published colors/editions survive; row must stay visible.
    assert.equal(deriveHasRun({ candidateCount: 0, knownFieldStateCount: 1 }), true);
    assert.equal(deriveHasRun({ candidateCount: 0, knownFieldStateCount: 3 }), true);
  });

  it('true when product has both candidates and known fields', () => {
    assert.equal(deriveHasRun({ candidateCount: 2, knownFieldStateCount: 3 }), true);
  });

  it('false when product has neither candidates nor known fields', () => {
    assert.equal(deriveHasRun({ candidateCount: 0, knownFieldStateCount: 0 }), false);
  });

  it('tolerates missing / undefined fields', () => {
    assert.equal(deriveHasRun({}), false);
    assert.equal(deriveHasRun({ candidateCount: 0 }), false);
    assert.equal(deriveHasRun({ knownFieldStateCount: 0 }), false);
  });
});
