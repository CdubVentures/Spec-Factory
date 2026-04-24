// WHY: Characterization test — locks down buildStudioFieldRule ai_assist block.
// The only retained Key Finder assist knobs are reasoning_note and the
// variant-inventory on/off flag.
// See: docs/implementation/field-rules-studio/ai-assist-knob-retirement-roadmap.md

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStudioFieldRule } from '../compileFieldRuleBuilder.js';

// ── Factory: extract just the ai_assist block from a compiled rule ────
function compileAiAssist(aiAssistInput) {
  const result = buildStudioFieldRule({
    key: 'test_field',
    rule: { ai_assist: aiAssistInput },
  });
  return result.ai_assist;
}

const DEFAULTS = { reasoning_note: '' };

// ── Defaults (missing / empty / non-object ai_assist) ────────────────

const defaultCases = [
  { label: 'undefined ai_assist', input: undefined },
  { label: 'null ai_assist', input: null },
  { label: 'non-object ai_assist (string)', input: 'garbage' },
  { label: 'non-object ai_assist (number)', input: 42 },
  { label: 'empty object', input: {} },
];

for (const { label, input } of defaultCases) {
  test(`defaults: ${label}`, () => {
    assert.deepEqual(compileAiAssist(input), DEFAULTS);
  });
}

// ── reasoning_note ───────────────────────────────────────────────────

const noteCases = [
  { label: 'normal string preserved', note: 'Extract color info', expected: 'Extract color info' },
  { label: 'whitespace trimmed', note: '  spaces  ', expected: 'spaces' },
  { label: 'empty string', note: '', expected: '' },
  { label: 'undefined becomes empty', note: undefined, expected: '' },
];

for (const { label, note, expected } of noteCases) {
  test(`reasoning_note: ${label}`, () => {
    assert.equal(compileAiAssist({ reasoning_note: note }).reasoning_note, expected);
  });
}

// ── Output shape has exactly 1 key ───────────────────────────────────

test('output shape defaults to reasoning_note only', () => {
  const result = compileAiAssist({});
  assert.deepEqual(Object.keys(result), ['reasoning_note']);
});

test('variant_inventory_usage preserves explicit enabled boolean only', () => {
  const result = compileAiAssist({
    reasoning_note: 'base note',
    variant_inventory_usage: {
      enabled: false,
      mode: 'append',
      profile: 'visual_design',
      text: '  Use only explicit base-shell evidence.  ',
    },
  });

  assert.deepEqual(result, {
    reasoning_note: 'base note',
    variant_inventory_usage: {
      enabled: false,
    },
  });
});

test('variant_inventory_usage maps legacy off mode to disabled', () => {
  const result = compileAiAssist({
    variant_inventory_usage: {
      mode: 'off',
      profile: 'visual_design',
      text: 'Legacy text is no longer a separate knob.',
    },
  });

  assert.deepEqual(result, {
    reasoning_note: '',
    variant_inventory_usage: {
      enabled: false,
    },
  });
});

test('variant_inventory_usage maps legacy active modes to enabled', () => {
  const result = compileAiAssist({
    variant_inventory_usage: {
      mode: 'append',
      profile: 'visual_design',
      text: 'Legacy text is no longer a separate knob.',
    },
  });

  assert.deepEqual(result, {
    reasoning_note: '',
    variant_inventory_usage: {
      enabled: true,
    },
  });
});

test('variant_inventory_usage drops invalid empty metadata', () => {
  const result = compileAiAssist({
    variant_inventory_usage: {
      mode: 'nonsense',
      profile: 'wat',
      text: '   ',
    },
  });

  assert.deepEqual(result, DEFAULTS);
});

// ── Retired fields are NOT in output ─────────────────────────────────

test('retired fields (mode, model_strategy, max_calls, max_tokens) are absent from output', () => {
  const result = compileAiAssist({
    mode: 'advisory', model_strategy: 'force_fast', max_calls: 5, max_tokens: 4096,
    reasoning_note: 'test',
  });
  assert.equal(result.reasoning_note, 'test');
  assert.equal('mode' in result, false);
  assert.equal('model_strategy' in result, false);
  assert.equal('max_calls' in result, false);
  assert.equal('max_tokens' in result, false);
});
