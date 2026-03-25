import test from 'node:test';
import assert from 'node:assert/strict';
import { createListRulesHarness } from './helpers/listRulesHarness.js';

const harness = await createListRulesHarness();
const { engine } = harness;

test.after(async () => {
  await harness.cleanup();
});

test('list_rules dedupe normalizes string duplicates and preserves first surviving casing', () => {
  const cases = [
    {
      input: 'Black, White, black, WHITE, white',
      expected: ['Black', 'White']
    },
    {
      input: '  Black  , Black,  black ',
      expected: ['Black']
    }
  ];

  for (const { input, expected } of cases) {
    const result = engine.normalizeCandidate('colors', input);
    assert.equal(result.ok, true, `expected colors normalization to succeed for ${input}`);
    assert.deepEqual(result.normalized, expected);
  }
});

test('list_rules dedupe follows per-field contract for numeric lists and explicit opt-out lists', () => {
  const numeric = engine.normalizeCandidate('sizes', '100, 200, 100, 300, 200');
  assert.equal(numeric.ok, true);
  assert.deepEqual(numeric.normalized, [100, 200, 300]);

  const optOut = engine.normalizeCandidate('tags', 'alpha, beta, alpha, gamma');
  assert.equal(optOut.ok, true);
  assert.deepEqual(optOut.normalized, ['alpha', 'beta', 'alpha', 'gamma']);
});
