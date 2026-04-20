import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvidencePromptBlock,
  evidenceRefSchema,
  evidenceRefsSchema,
} from '../evidencePromptFragment.js';
import { GLOBAL_PROMPTS } from '../../llm/prompts/globalPromptRegistry.js';

// Template text is authoritative in the registry; the fragment builder
// calls resolveGlobalPrompt('evidenceContract') under the hood.
const EVIDENCE_PROMPT_FRAGMENT = GLOBAL_PROMPTS.evidenceContract.defaultTemplate;

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

  it('uses "AT LEAST" language to allow multiple sources', () => {
    assert.ok(
      EVIDENCE_PROMPT_FRAGMENT.includes('AT LEAST'),
      'fragment must use "AT LEAST" so the LLM knows it can provide more than one source',
    );
  });

  it('teaches the LLM to rate per-source confidence', () => {
    assert.ok(
      EVIDENCE_PROMPT_FRAGMENT.toLowerCase().includes('confidence'),
      'fragment must ask the LLM to rate confidence per source',
    );
  });
});

describe('evidenceRefSchema (universal shape)', () => {
  it('parses {url, tier, confidence}', () => {
    const parsed = evidenceRefSchema.parse({ url: 'https://x.com', tier: 'tier1', confidence: 95 });
    assert.equal(parsed.url, 'https://x.com');
    assert.equal(parsed.tier, 'tier1');
    assert.equal(parsed.confidence, 95);
  });

  it('defaults confidence to 0 when omitted', () => {
    const parsed = evidenceRefSchema.parse({ url: 'https://x.com', tier: 'tier1' });
    assert.equal(parsed.confidence, 0);
  });

  it('rejects missing url', () => {
    assert.throws(() => evidenceRefSchema.parse({ tier: 'tier1' }));
  });

  it('rejects missing tier', () => {
    assert.throws(() => evidenceRefSchema.parse({ url: 'u' }));
  });

  it('rejects confidence outside 0-100', () => {
    assert.throws(() => evidenceRefSchema.parse({ url: 'u', tier: 'tier1', confidence: 150 }));
    assert.throws(() => evidenceRefSchema.parse({ url: 'u', tier: 'tier1', confidence: -5 }));
  });

  it('rejects non-integer confidence', () => {
    assert.throws(() => evidenceRefSchema.parse({ url: 'u', tier: 'tier1', confidence: 85.5 }));
  });

  it('accepts any tier string (no enum enforcement — classification only)', () => {
    const parsed = evidenceRefSchema.parse({ url: 'u', tier: 'tier5', confidence: 40 });
    assert.equal(parsed.tier, 'tier5');
  });
});

describe('evidenceRefsSchema', () => {
  it('defaults to empty array when omitted at parent level', () => {
    // Simulate parent schema use: parse wraps default behavior
    const Wrapper = evidenceRefsSchema;
    assert.deepEqual(Wrapper.parse(undefined), []);
  });

  it('parses an array of valid entries', () => {
    const refs = evidenceRefsSchema.parse([
      { url: 'u1', tier: 'tier1', confidence: 90 },
      { url: 'u2', tier: 'tier3', confidence: 50 },
    ]);
    assert.equal(refs.length, 2);
  });

  it('rejects non-array', () => {
    assert.throws(() => evidenceRefsSchema.parse({ url: 'u', tier: 'tier1' }));
  });
});

describe('buildEvidencePromptBlock', () => {
  it('substitutes MIN_EVIDENCE_REFS with the provided number', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: 3 });
    assert.ok(block.includes('AT LEAST 3'));
    assert.ok(!block.includes('{{MIN_EVIDENCE_REFS}}'));
  });

  it('defaults to 1 when called with no args', () => {
    const block = buildEvidencePromptBlock();
    assert.ok(block.includes('AT LEAST 1'));
    assert.ok(!block.includes('{{MIN_EVIDENCE_REFS}}'));
  });

  it('defaults to 1 when minEvidenceRefs is undefined', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: undefined });
    assert.ok(block.includes('AT LEAST 1'));
  });

  it('defaults to 1 when minEvidenceRefs is null', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: null });
    assert.ok(block.includes('AT LEAST 1'));
  });

  it('defaults to 1 when minEvidenceRefs is 0 (impossible config, safe fallback)', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: 0 });
    assert.ok(block.includes('AT LEAST 1'));
  });

  it('defaults to 1 when minEvidenceRefs is a negative number', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: -2 });
    assert.ok(block.includes('AT LEAST 1'));
  });

  it('defaults to 1 when minEvidenceRefs is a non-number', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: '3' });
    assert.ok(block.includes('AT LEAST 1'));
  });

  it('rendered block includes all 6 tier codes', () => {
    const block = buildEvidencePromptBlock({ minEvidenceRefs: 2 });
    for (const code of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'other']) {
      assert.ok(block.includes(code), `rendered block must list "${code}"`);
    }
  });
});
