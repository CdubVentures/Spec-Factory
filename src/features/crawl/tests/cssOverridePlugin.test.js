import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cssOverridePlugin } from '../plugins/cssOverridePlugin.js';

function createPageDouble({ evaluateResult = 0 } = {}) {
  const evaluateCalls = [];
  const styleTags = [];
  const waitedMs = [];
  return {
    evaluateCalls,
    styleTags,
    waitedMs,
    async evaluate(fn) {
      evaluateCalls.push(fn);
      return typeof evaluateResult === 'function' ? evaluateResult(fn) : evaluateResult;
    },
    async addStyleTag(opts) {
      styleTags.push(opts);
    },
    async waitForTimeout(ms) {
      waitedMs.push(ms);
    },
  };
}

describe('cssOverridePlugin', () => {
  it('has correct plugin shape', () => {
    assert.equal(cssOverridePlugin.name, 'cssOverride');
    assert.equal(typeof cssOverridePlugin.hooks.onInteract, 'function');
  });

  it('returns disabled when cssOverrideEnabled is false', async () => {
    const page = createPageDouble();
    const result = await cssOverridePlugin.hooks.onInteract({
      page,
      settings: { cssOverrideEnabled: false },
    });
    assert.equal(result.enabled, false);
    assert.equal(result.hiddenBefore, 0);
    assert.equal(result.revealedAfter, 0);
    assert.equal(page.styleTags.length, 0, 'should not inject CSS when disabled');
  });

  it('returns disabled when cssOverrideEnabled is undefined (default off)', async () => {
    const page = createPageDouble();
    const result = await cssOverridePlugin.hooks.onInteract({
      page,
      settings: {},
    });
    assert.equal(result.enabled, false);
    assert.equal(page.styleTags.length, 0);
  });

  it('injects CSS and counts hidden elements when enabled', async () => {
    const page = createPageDouble({ evaluateResult: 7 });
    const result = await cssOverridePlugin.hooks.onInteract({
      page,
      settings: { cssOverrideEnabled: true },
    });
    assert.equal(result.enabled, true);
    assert.equal(result.hiddenBefore, 7);
    assert.equal(result.revealedAfter, 7);
    assert.equal(page.styleTags.length, 1, 'should inject one style tag');
    assert.ok(page.styleTags[0].content.includes('display: block !important'));
  });

  it('works with string "true" for cssOverrideEnabled', async () => {
    const page = createPageDouble({ evaluateResult: 3 });
    const result = await cssOverridePlugin.hooks.onInteract({
      page,
      settings: { cssOverrideEnabled: 'true' },
    });
    assert.equal(result.enabled, true);
    assert.equal(result.hiddenBefore, 3);
  });

  it('calls page.evaluate to count hidden elements', async () => {
    const page = createPageDouble({ evaluateResult: 0 });
    await cssOverridePlugin.hooks.onInteract({
      page,
      settings: { cssOverrideEnabled: true },
    });
    assert.equal(page.evaluateCalls.length, 1, 'should call evaluate once to count hidden elements');
  });
});
