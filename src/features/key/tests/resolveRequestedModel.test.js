// Boundary contract for the model-name that keyFinder both DISPLAYS on the
// pending LLM-call row AND PERSISTS on the run record. Same rule as
// keyFinder.js:381-383 for persistedModel — now extracted so the pending row
// (keyFinder.js:340 initialModel) can't drift from the persisted truth.
//
// Bug this locks: easy tier had `model=""` + `useReasoning:true` +
// `reasoningModel="lab-openai:gpt-5.4-mini"`. Line 340's old `tierBundle.model
// || llmModelPlan` ignored the reasoningModel and displayed
// `gemini-2.5-flash-lite` while the actual call (and persisted record) used
// `lab-openai:gpt-5.4-mini`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequestedModel } from '../resolveRequestedModel.js';

describe('resolveRequestedModel', () => {
  it('useReasoning=true + reasoningModel set → reasoningModel wins over tier.model and plan', () => {
    assert.equal(
      resolveRequestedModel(
        { useReasoning: true, reasoningModel: 'lab-openai:gpt-5.4-mini', model: 'gpt-5.4' },
        'gemini-2.5-flash-lite',
      ),
      'lab-openai:gpt-5.4-mini',
    );
  });

  it('useReasoning=true + reasoningModel empty → falls through to tier.model', () => {
    assert.equal(
      resolveRequestedModel(
        { useReasoning: true, reasoningModel: '', model: 'deepseek-chat' },
        'gemini-2.5-flash-lite',
      ),
      'deepseek-chat',
    );
  });

  it('useReasoning=false + tier.model set → tier.model wins over plan', () => {
    assert.equal(
      resolveRequestedModel(
        { useReasoning: false, reasoningModel: 'lab-openai:gpt-5.4', model: 'deepseek-chat' },
        'gemini-2.5-flash-lite',
      ),
      'deepseek-chat',
    );
  });

  it('useReasoning=false + tier.model empty → llmModelPlan last-resort', () => {
    assert.equal(
      resolveRequestedModel(
        { useReasoning: false, reasoningModel: '', model: '' },
        'gemini-2.5-flash-lite',
      ),
      'gemini-2.5-flash-lite',
    );
  });

  it('everything empty → "unknown" sentinel (never empty string)', () => {
    assert.equal(resolveRequestedModel({}, ''), 'unknown');
    assert.equal(resolveRequestedModel(null, null), 'unknown');
    assert.equal(resolveRequestedModel(undefined, undefined), 'unknown');
  });

  it('trims whitespace on all fields — stored values may carry stray spaces', () => {
    assert.equal(
      resolveRequestedModel(
        { useReasoning: true, reasoningModel: '  lab-openai:gpt-5.4-mini  ', model: '' },
        '',
      ),
      'lab-openai:gpt-5.4-mini',
    );
  });
});
