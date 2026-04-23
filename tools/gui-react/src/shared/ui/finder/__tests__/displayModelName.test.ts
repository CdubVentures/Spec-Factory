// WHY: The persisted keyFinder run stores the fully-qualified tier model
// (e.g. "lab-openai:gpt-5.4-mini") — that's the routing identity. UI displays
// want the bare model ID ("gpt-5.4-mini") to stay readable in narrow table
// cells. Mirror of src/core/llm/routeResolver.js#stripCompositeKey — the JS
// module is the behavioral SSOT.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { displayModelName } from '../displayModelName.ts';

describe('displayModelName', () => {
  it('strips provider prefix from composite keys', () => {
    assert.equal(displayModelName('lab-openai:gpt-5.4-mini'), 'gpt-5.4-mini');
    assert.equal(displayModelName('default-deepseek:deepseek-chat'), 'deepseek-chat');
    assert.equal(displayModelName('default-gemini:gemini-2.5-flash'), 'gemini-2.5-flash');
  });

  it('passes bare model names through unchanged', () => {
    assert.equal(displayModelName('gpt-5.4-mini'), 'gpt-5.4-mini');
    assert.equal(displayModelName('gemini-2.5-flash-lite'), 'gemini-2.5-flash-lite');
    assert.equal(displayModelName('deepseek-chat'), 'deepseek-chat');
  });

  it('handles empty / null / undefined input as empty string', () => {
    assert.equal(displayModelName(''), '');
    assert.equal(displayModelName(null as unknown as string), '');
    assert.equal(displayModelName(undefined as unknown as string), '');
  });

  it('leading colon is NOT a provider prefix (no strip)', () => {
    assert.equal(displayModelName(':weird-model'), ':weird-model');
  });

  it('trims whitespace before stripping', () => {
    assert.equal(displayModelName('  lab-openai:gpt-5.4-mini  '), 'gpt-5.4-mini');
  });
});
