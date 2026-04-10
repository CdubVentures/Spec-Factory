// WHY: Characterization test — locks down normalizeReviewAiAssist() behavior.
// After ai_assist knob retirement, this function returns only { reasoning_note }.
// See: docs/implementation/field-rules-studio/ai-assist-knob-retirement-roadmap.md

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeReviewAiAssist } from '../compileUtils.js';

// ── Whole-object edge cases ──────────────────────────────────────────

const DEFAULTS = { reasoning_note: '' };

const wholeObjectCases = [
  { label: 'undefined input', input: undefined, expected: DEFAULTS },
  { label: 'null input', input: null, expected: DEFAULTS },
  { label: 'non-object (number)', input: 42, expected: DEFAULTS },
  { label: 'non-object (string)', input: 'hello', expected: DEFAULTS },
  { label: 'empty object', input: {}, expected: DEFAULTS },
  {
    label: 'object with reasoning_note',
    input: { reasoning_note: 'test guidance' },
    expected: { reasoning_note: 'test guidance' },
  },
];

for (const { label, input, expected } of wholeObjectCases) {
  test(`whole-object: ${label}`, () => {
    assert.deepEqual(normalizeReviewAiAssist(input), expected);
  });
}

// ── reasoning_note normalization ─────────────────────────────────────

const noteCases = [
  { label: 'normal string preserved', note: 'Extract color info', expected: 'Extract color info' },
  { label: 'whitespace trimmed', note: '  spaces  ', expected: 'spaces' },
  { label: 'empty string', note: '', expected: '' },
  { label: 'undefined becomes empty', note: undefined, expected: '' },
  { label: 'null becomes empty', note: null, expected: '' },
];

for (const { label, note, expected } of noteCases) {
  test(`reasoning_note: ${label}`, () => {
    const result = normalizeReviewAiAssist({ reasoning_note: note });
    assert.equal(result.reasoning_note, expected);
  });
}

// ── Output shape has exactly 1 key ───────────────────────────────────

test('output shape has exactly 1 key: reasoning_note', () => {
  const result = normalizeReviewAiAssist({});
  assert.deepEqual(Object.keys(result), ['reasoning_note']);
});

// ── Retired fields are NOT in output ─────────────────────────────────

test('retired fields (mode, model_strategy, max_calls, max_tokens) are absent from output', () => {
  const result = normalizeReviewAiAssist({
    mode: 'advisory', model_strategy: 'force_fast', max_calls: 5, max_tokens: 4096,
    reasoning_note: 'test',
  });
  assert.equal(result.reasoning_note, 'test');
  assert.equal('mode' in result, false);
  assert.equal('model_strategy' in result, false);
  assert.equal('max_calls' in result, false);
  assert.equal('max_tokens' in result, false);
});
