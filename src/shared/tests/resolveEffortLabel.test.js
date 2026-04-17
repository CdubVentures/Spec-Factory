import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffortLabel } from '../resolveEffortLabel.js';

// ---------------------------------------------------------------------------
// resolveEffortLabel — table-driven boundary matrix
//
// Contract:
//   - Baked model-name suffix (e.g. gpt-5-low) always wins, regardless of thinking.
//   - Otherwise, configured effort is returned only when thinking is truthy.
//   - Empty/nullish inputs coerce to ''.
// ---------------------------------------------------------------------------

const CASES = [
  // Baked suffix always wins
  [{ model: 'gpt-5.4-low', effortLevel: '', thinking: false }, 'low', 'baked + thinking off → baked'],
  [{ model: 'gpt-5.4-xhigh', effortLevel: '', thinking: true }, 'xhigh', 'baked + thinking on → baked'],
  [{ model: 'gpt-5-minimal', effortLevel: 'high', thinking: true }, 'minimal', 'baked overrides configured'],
  [{ model: 'gpt-5-minimal', effortLevel: 'high', thinking: false }, 'minimal', 'baked wins even with thinking off'],

  // Non-baked + thinking off → empty (the bug this fix targets)
  [{ model: 'gpt-5.4-mini', effortLevel: 'low', thinking: false }, '', 'non-baked + thinking off discards configured'],
  [{ model: 'gemini-2.5-flash-lite', effortLevel: 'high', thinking: false }, '', 'gemini lite + thinking off → empty'],
  [{ model: 'claude-sonnet-4-6', effortLevel: 'medium', thinking: false }, '', 'claude + thinking off → empty'],

  // Non-baked + thinking on → configured
  [{ model: 'gpt-4o', effortLevel: 'medium', thinking: true }, 'medium', 'non-baked + thinking on → configured'],
  [{ model: 'gpt-4o', effortLevel: '', thinking: true }, '', 'non-baked + thinking on + empty → empty'],

  // Edge cases — thinking coercion
  [{ model: 'gpt-4o', effortLevel: 'low', thinking: undefined }, '', 'undefined thinking treated as off'],
  [{ model: 'gpt-4o', effortLevel: 'low', thinking: null }, '', 'null thinking treated as off'],

  // Edge cases — model coercion
  [{ model: '', effortLevel: 'low', thinking: true }, 'low', 'empty model + thinking on → configured'],
  [{ model: null, effortLevel: 'low', thinking: true }, 'low', 'null model + thinking on → configured'],
  [{ model: undefined, effortLevel: 'low', thinking: false }, '', 'undefined model + thinking off → empty'],

  // Edge cases — effortLevel coercion
  [{ model: 'gpt-4o', effortLevel: null, thinking: true }, '', 'null effort + thinking on → empty'],
  [{ model: 'gpt-4o', effortLevel: undefined, thinking: true }, '', 'undefined effort + thinking on → empty'],

  // No args
  [undefined, '', 'no input → empty'],
  [{}, '', 'empty input → empty'],
];

for (const [input, expected, label] of CASES) {
  test(`resolveEffortLabel: ${label}`, () => {
    assert.equal(resolveEffortLabel(input), expected);
  });
}
