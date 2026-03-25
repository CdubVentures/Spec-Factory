import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LLM_ROUTE_BOOLEAN_KEYS,
  LLM_ROUTE_COLUMN_REGISTRY,
} from '../specDbSchema.js';
import { defaultContextFlagsForScope } from '../specDbHelpers.js';

function expectedPromptFlags(scope) {
  const isComponent = scope === 'component';
  return Object.fromEntries(
    LLM_ROUTE_COLUMN_REGISTRY
      .filter((column) => column.promptFlag)
      .map((column) => [
        column.key,
        column.componentOnly ? (isComponent ? 1 : 0) : column.sqlDefault,
      ]),
  );
}

describe('LLM route column contract', () => {
  it('exports boolean keys for every boolean route column and nothing else', () => {
    const expected = LLM_ROUTE_COLUMN_REGISTRY
      .filter((column) => column.type === 'bool')
      .map((column) => column.key);

    assert.deepStrictEqual(LLM_ROUTE_BOOLEAN_KEYS, expected);
  });

  it('builds field-scope prompt defaults from promptFlag metadata', () => {
    assert.deepStrictEqual(
      defaultContextFlagsForScope('field'),
      expectedPromptFlags('field'),
    );
  });

  it('builds component-scope prompt defaults from promptFlag metadata', () => {
    assert.deepStrictEqual(
      defaultContextFlagsForScope('component'),
      expectedPromptFlags('component'),
    );
  });
});
