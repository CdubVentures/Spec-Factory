import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmCallDeps } from '../buildLlmCallDeps.js';

describe('buildLlmCallDeps', () => {
  it('returns object with callRoutedLlmFn, config, logger', () => {
    const config = { llmModelPlan: 'test-model' };
    const logger = { info: () => {}, warn: () => {}, error: () => {} };
    const deps = buildLlmCallDeps({ config, logger });

    assert.equal(typeof deps.callRoutedLlmFn, 'function');
    assert.equal(deps.config, config);
    assert.equal(deps.logger, logger);
  });

  it('works with null logger', () => {
    const deps = buildLlmCallDeps({ config: {}, logger: null });
    assert.equal(deps.logger, null);
    assert.equal(typeof deps.callRoutedLlmFn, 'function');
  });

  it('callRoutedLlmFn is the real callLlmWithRouting', async () => {
    const deps = buildLlmCallDeps({ config: {}, logger: null });
    // Just verify it's a function — calling it would require full config
    assert.equal(deps.callRoutedLlmFn.name, 'callLlmWithRouting');
  });

  it('threads onModelResolved through to returned deps', () => {
    const cb = () => {};
    const deps = buildLlmCallDeps({ config: {}, logger: null, onModelResolved: cb });
    assert.equal(deps.onModelResolved, cb);
  });

  it('onModelResolved defaults to undefined when not provided', () => {
    const deps = buildLlmCallDeps({ config: {}, logger: null });
    assert.equal(deps.onModelResolved, undefined);
  });
});
