import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDecisionDisplay } from '../searchResultsHelpers.js';

function makeResult(overrides = {}) {
  return {
    decision: '',
    rationale: '',
    reason: '',
    ...overrides,
  };
}

describe('resolveDecisionDisplay', () => {
  // ── Enriched triage decisions ──

  it('hard_drop with denied_host → Denied Host (warning)', () => {
    const result = makeResult({ decision: 'hard_drop', rationale: 'denied_host' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Denied Host', chipClass: 'sf-chip-warning' });
  });

  it('hard_drop with video_platform → Video Platform (warning)', () => {
    const result = makeResult({ decision: 'hard_drop', rationale: 'video_platform' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Video Platform', chipClass: 'sf-chip-warning' });
  });

  it('hard_drop with utility_shell → Utility Shell (warning)', () => {
    const result = makeResult({ decision: 'hard_drop', rationale: 'utility_shell' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Utility Shell', chipClass: 'sf-chip-warning' });
  });

  it('hard_drop with unknown reason → Hard Drop (warning)', () => {
    const result = makeResult({ decision: 'hard_drop', rationale: 'some_unknown' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Hard Drop', chipClass: 'sf-chip-warning' });
  });

  it('hard_drop reads reason field as fallback for rationale', () => {
    const result = makeResult({ decision: 'hard_drop', reason: 'denied_host' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Denied Host', chipClass: 'sf-chip-warning' });
  });

  it('keep → Keep (success)', () => {
    const result = makeResult({ decision: 'keep' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Keep', chipClass: 'sf-chip-success' });
  });

  it('drop → LLM Drop (danger)', () => {
    const result = makeResult({ decision: 'drop' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'LLM Drop', chipClass: 'sf-chip-danger' });
  });

  it('maybe → Maybe (info)', () => {
    const result = makeResult({ decision: 'maybe' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Maybe', chipClass: 'sf-chip-info' });
  });

  it('unknown → Unknown (neutral)', () => {
    const result = makeResult({ decision: 'unknown' });
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Unknown', chipClass: 'sf-chip-neutral' });
  });

  // ── Client-side fallback (no enrichment) ──

  it('no enrichment + isVideo → Video (danger)', () => {
    const result = makeResult();
    assert.deepEqual(resolveDecisionDisplay(result, { isVideo: true }), { label: 'Video', chipClass: 'sf-chip-danger' });
  });

  it('no enrichment + isDuplicate → Dup (danger)', () => {
    const result = makeResult();
    assert.deepEqual(resolveDecisionDisplay(result, { isDuplicate: true }), { label: 'Dup', chipClass: 'sf-chip-danger' });
  });

  it('no enrichment + isCrawled → Crawled (purple)', () => {
    const result = makeResult();
    assert.deepEqual(resolveDecisionDisplay(result, { isCrawled: true }), { label: 'Crawled', chipClass: 'sf-chip-purple' });
  });

  it('no enrichment, no flags → Pass (success)', () => {
    const result = makeResult();
    assert.deepEqual(resolveDecisionDisplay(result), { label: 'Pass', chipClass: 'sf-chip-success' });
  });

  // ── Priority: enriched > flags > unknown ──

  it('enriched keep overrides isVideo flag', () => {
    const result = makeResult({ decision: 'keep' });
    assert.deepEqual(resolveDecisionDisplay(result, { isVideo: true }), { label: 'Keep', chipClass: 'sf-chip-success' });
  });

  it('isCrawled overrides unknown decision', () => {
    const result = makeResult({ decision: 'unknown' });
    assert.deepEqual(resolveDecisionDisplay(result, { isCrawled: true }), { label: 'Crawled', chipClass: 'sf-chip-purple' });
  });

  it('isVideo overrides unknown decision', () => {
    const result = makeResult({ decision: 'unknown' });
    assert.deepEqual(resolveDecisionDisplay(result, { isVideo: true }), { label: 'Video', chipClass: 'sf-chip-danger' });
  });

  it('isDuplicate overrides unknown decision', () => {
    const result = makeResult({ decision: 'unknown' });
    assert.deepEqual(resolveDecisionDisplay(result, { isDuplicate: true }), { label: 'Dup', chipClass: 'sf-chip-danger' });
  });
});
