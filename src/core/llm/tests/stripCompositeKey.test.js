import test from 'node:test';
import assert from 'node:assert/strict';
import { stripCompositeKey } from '../routeResolver.js';

test('stripCompositeKey removes provider prefix from composite key', () => {
  const cases = [
    ['lab-openai:gpt-5.4-xhigh', 'gpt-5.4-xhigh'],
    ['openai:gpt-4o', 'gpt-4o'],
    ['gpt-4o', 'gpt-4o'],
    ['', ''],
    [undefined, ''],
    [null, ''],
    ['  lab-anthropic:claude-sonnet  ', 'claude-sonnet'],
    [':model-with-leading-colon', ':model-with-leading-colon'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(stripCompositeKey(input), expected, `stripCompositeKey(${JSON.stringify(input)}) should be ${JSON.stringify(expected)}`);
  }
});
