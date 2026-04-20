import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildValueConfidencePromptBlock,
  valueConfidenceSchema,
} from '../valueConfidencePromptFragment.js';
import { GLOBAL_PROMPTS } from '../../llm/prompts/globalPromptRegistry.js';

// Template text is authoritative in the registry; the fragment builder
// calls resolveGlobalPrompt('valueConfidenceRubric') under the hood.
const VALUE_CONFIDENCE_PROMPT_FRAGMENT = GLOBAL_PROMPTS.valueConfidenceRubric.defaultTemplate;

describe('VALUE_CONFIDENCE_PROMPT_FRAGMENT', () => {
  it('asks the LLM to rate overall confidence based on cited evidence', () => {
    const lower = VALUE_CONFIDENCE_PROMPT_FRAGMENT.toLowerCase();
    assert.ok(lower.includes('overall confidence'));
    assert.ok(lower.includes('evidence'));
  });

  it('includes the 0-100 range', () => {
    assert.ok(VALUE_CONFIDENCE_PROMPT_FRAGMENT.includes('0-100'));
  });

  it('provides a tier-based rubric so the LLM calibrates against evidence strength', () => {
    for (const band of ['90+', '70-89', '50-69', '30-49', '0-29']) {
      assert.ok(
        VALUE_CONFIDENCE_PROMPT_FRAGMENT.includes(band),
        `rubric must include band "${band}"`,
      );
    }
  });

  it('references tiers so the LLM connects confidence to evidence strength', () => {
    for (const code of ['tier1', 'tier2', 'tier3', 'tier4', 'tier5']) {
      assert.ok(
        VALUE_CONFIDENCE_PROMPT_FRAGMENT.includes(code),
        `rubric must reference "${code}" to tie confidence to evidence`,
      );
    }
  });

  it('explicitly warns against inflating confidence beyond cited evidence', () => {
    const lower = VALUE_CONFIDENCE_PROMPT_FRAGMENT.toLowerCase();
    assert.ok(
      lower.includes('not inflate') || lower.includes("don't inflate") || lower.includes('do not inflate'),
      'fragment must warn against overconfidence',
    );
  });
});

describe('valueConfidenceSchema', () => {
  it('parses 0', () => {
    assert.equal(valueConfidenceSchema.parse(0), 0);
  });

  it('parses 100', () => {
    assert.equal(valueConfidenceSchema.parse(100), 100);
  });

  it('parses a typical value like 75', () => {
    assert.equal(valueConfidenceSchema.parse(75), 75);
  });

  it('rejects negative numbers', () => {
    assert.throws(() => valueConfidenceSchema.parse(-1));
  });

  it('rejects numbers > 100', () => {
    assert.throws(() => valueConfidenceSchema.parse(101));
  });

  it('rejects non-integers', () => {
    assert.throws(() => valueConfidenceSchema.parse(85.5));
  });

  it('rejects non-numbers', () => {
    assert.throws(() => valueConfidenceSchema.parse('85'));
    assert.throws(() => valueConfidenceSchema.parse(null));
    assert.throws(() => valueConfidenceSchema.parse(undefined));
  });
});

describe('buildValueConfidencePromptBlock', () => {
  it('returns the full fragment when called with no args', () => {
    const block = buildValueConfidencePromptBlock();
    assert.equal(block, VALUE_CONFIDENCE_PROMPT_FRAGMENT);
  });

  it('produces a stable string across calls', () => {
    const a = buildValueConfidencePromptBlock();
    const b = buildValueConfidencePromptBlock();
    assert.equal(a, b);
  });

  it('rendered block references all 5 confidence bands', () => {
    const block = buildValueConfidencePromptBlock();
    for (const band of ['90+', '70-89', '50-69', '30-49', '0-29']) {
      assert.ok(block.includes(band));
    }
  });
});
