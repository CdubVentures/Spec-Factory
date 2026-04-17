import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EVIDENCE_PROMPT_FRAGMENT, buildEvidencePromptBlock } from '../evidencePromptFragment.js';

describe('EVIDENCE_PROMPT_FRAGMENT', () => {
  it('contains the {{MIN_EVIDENCE_REFS}} placeholder', () => {
    assert.ok(EVIDENCE_PROMPT_FRAGMENT.includes('{{MIN_EVIDENCE_REFS}}'));
  });

  it('lists all 6 tier codes literally', () => {
    for (const code of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'other']) {
      assert.ok(
        EVIDENCE_PROMPT_FRAGMENT.includes(code),
        `fragment must list tier code "${code}"`,
      );
    }
  });

  it('does not direct the LLM to prefer one tier over another (classification only)', () => {
    const lower = EVIDENCE_PROMPT_FRAGMENT.toLowerCase();
    for (const phrase of ['prefer tier', 'higher tier', 'better tier', 'ranked higher', 'prioritize tier']) {
      assert.ok(
        !lower.includes(phrase),
        `fragment must not direct tier preference: "${phrase}"`,
      );
    }
  });
});

describe('buildEvidencePromptBlock', () => {
  it('substitutes MIN_EVIDENCE_REFS with the provided number', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: 3 });
    assert.ok(block.includes('cite at least 3'));
    assert.ok(!block.includes('{{MIN_EVIDENCE_REFS}}'));
  });

  it('defaults to 1 when called with no args', () => {
    const block = buildEvidencePromptBlock();
    assert.ok(block.includes('cite at least 1'));
    assert.ok(!block.includes('{{MIN_EVIDENCE_REFS}}'));
  });

  it('defaults to 1 when minEvidenceRefs is undefined', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: undefined });
    assert.ok(block.includes('cite at least 1'));
  });

  it('defaults to 1 when minEvidenceRefs is null', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: null });
    assert.ok(block.includes('cite at least 1'));
  });

  it('defaults to 1 when minEvidenceRefs is 0 (impossible config, safe fallback)', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: 0 });
    assert.ok(block.includes('cite at least 1'));
  });

  it('defaults to 1 when minEvidenceRefs is a negative number', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: -2 });
    assert.ok(block.includes('cite at least 1'));
  });

  it('defaults to 1 when minEvidenceRefs is a non-number', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: '3' });
    assert.ok(block.includes('cite at least 1'));
  });

  it('rendered block includes all 6 tier codes', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: 2 });
    for (const code of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'other']) {
      assert.ok(block.includes(code), `rendered block must list "${code}"`);
    }
  });
});
