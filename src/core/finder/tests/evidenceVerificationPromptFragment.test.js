/**
 * Contract: reusable evidence-verification fragment for finder LLM prompts.
 *
 * Finders (CEF, RDF) inject this block alongside buildEvidencePromptBlock to
 * require the LLM to personally fetch each cited URL before citing it. The
 * publisher then HEAD-checks to catch hallucinated URLs regardless.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceVerificationPromptBlock } from '../evidenceVerificationPromptFragment.js';

describe('buildEvidenceVerificationPromptBlock', () => {
  it('returns a non-empty string when enabled (default)', () => {
    const block = buildEvidenceVerificationPromptBlock();
    assert.equal(typeof block, 'string');
    assert.ok(block.length > 0);
  });

  it('returns empty string when enabled: false', () => {
    assert.equal(buildEvidenceVerificationPromptBlock({ enabled: false }), '');
  });

  it('mentions personal fetch requirement', () => {
    const block = buildEvidenceVerificationPromptBlock();
    assert.match(block, /fetch/i);
    assert.match(block, /session/i);
  });

  it('warns against synthesizing URLs from training / pattern-matching', () => {
    const block = buildEvidenceVerificationPromptBlock();
    assert.match(block, /synthesiz|pattern|training|hallucin/i);
  });

  it('instructs the LLM that the publisher will HEAD-check cited URLs', () => {
    const block = buildEvidenceVerificationPromptBlock();
    assert.match(block, /HEAD|verif|publisher/i);
  });

  it('returns the same output across calls (deterministic / cacheable)', () => {
    const a = buildEvidenceVerificationPromptBlock();
    const b = buildEvidenceVerificationPromptBlock();
    assert.equal(a, b);
  });
});
