/**
 * Tests for resolveIdentityLabel — shared labeling function used by
 * both consensus engine (KP1) and candidate annotation (KP2).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIdentityLabel } from '../src/pipeline/identityGateExtraction.js';

describe('resolveIdentityLabel', () => {

  it('returns "matched" when identity.match is true', () => {
    assert.equal(resolveIdentityLabel({ match: true, score: 0.95 }), 'matched');
  });

  it('returns "matched" when match is true even with low score', () => {
    assert.equal(resolveIdentityLabel({ match: true, score: 0.1 }), 'matched');
  });

  it('returns "different" when criticalConflicts are present', () => {
    assert.equal(
      resolveIdentityLabel({ match: false, score: 0.8, criticalConflicts: ['brand_mismatch'] }),
      'different'
    );
  });

  it('returns "different" even with high score when criticalConflicts exist', () => {
    assert.equal(
      resolveIdentityLabel({ match: false, score: 0.99, criticalConflicts: ['model_mismatch'] }),
      'different'
    );
  });

  it('returns "possible" when not matched, no conflicts, score >= 0.4', () => {
    assert.equal(resolveIdentityLabel({ match: false, score: 0.5 }), 'possible');
  });

  it('returns "possible" at score boundary 0.4', () => {
    assert.equal(resolveIdentityLabel({ match: false, score: 0.4 }), 'possible');
  });

  it('returns "different" when score < 0.4 with no conflicts', () => {
    assert.equal(resolveIdentityLabel({ match: false, score: 0.39 }), 'different');
  });

  it('returns "different" when score is 0', () => {
    assert.equal(resolveIdentityLabel({ match: false, score: 0 }), 'different');
  });

  it('returns "unknown" for null identity', () => {
    assert.equal(resolveIdentityLabel(null), 'unknown');
  });

  it('returns "unknown" for undefined identity', () => {
    assert.equal(resolveIdentityLabel(undefined), 'unknown');
  });

  it('returns "unknown" for non-object identity', () => {
    assert.equal(resolveIdentityLabel('string'), 'unknown');
    assert.equal(resolveIdentityLabel(42), 'unknown');
  });

  it('returns "matched" for empty object with match=true', () => {
    assert.equal(resolveIdentityLabel({ match: true }), 'matched');
  });

  it('treats empty criticalConflicts array as no conflicts', () => {
    assert.equal(
      resolveIdentityLabel({ match: false, score: 0.5, criticalConflicts: [] }),
      'possible'
    );
  });
});
