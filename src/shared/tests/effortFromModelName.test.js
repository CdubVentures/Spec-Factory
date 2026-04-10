import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEffortFromModelName } from '../effortFromModelName.js';

// ---------------------------------------------------------------------------
// extractEffortFromModelName — table-driven unit tests
// ---------------------------------------------------------------------------

const CASES = [
  // Dash-separated effort suffixes
  ['gpt-5.4-xhigh', 'xhigh', 'dash-separated xhigh'],
  ['gpt-5.4-high', 'high', 'dash-separated high'],
  ['gpt-5.4-medium', 'medium', 'dash-separated medium'],
  ['gpt-5.4-low', 'low', 'dash-separated low'],
  ['gpt-5-minimal', 'minimal', 'dash-separated minimal'],
  // Underscore separator
  ['gpt-5_high', 'high', 'underscore separator'],
  // Case insensitive
  ['GPT-5.4-XHIGH', 'xhigh', 'case insensitive'],
  // Compound model names (gpt-5.4-pro family)
  ['gpt-5.4-pro-xhigh', 'xhigh', 'compound: last segment is effort'],
  ['gpt-5.4-pro-high', 'high', 'compound: last segment is effort'],
  ['gpt-5.4-pro-medium', 'medium', 'compound: last segment is effort'],
  // Base models — NO effort suffix
  ['gpt-5.4', null, 'base model, no suffix'],
  ['gpt-5.4-pro', null, '-pro is not an effort level'],
  ['gpt-5.4-mini', null, '-mini is not an effort'],
  ['gpt-5.4-nano', null, '-nano is not an effort'],
  ['claude-sonnet-4-6', null, 'claude model, not effort'],
  ['gemini-2.5-flash', null, 'gemini model, not effort'],
  ['gemini-2.5-flash-lite', null, '-lite is not an effort'],
  // Edge cases
  ['', null, 'empty string'],
  [null, null, 'null'],
  [undefined, null, 'undefined'],
];

for (const [input, expected, label] of CASES) {
  test(`extractEffortFromModelName: ${label} → ${JSON.stringify(input)} = ${expected}`, () => {
    assert.equal(extractEffortFromModelName(input), expected);
  });
}
