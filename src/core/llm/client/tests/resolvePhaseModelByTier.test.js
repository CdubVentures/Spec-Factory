import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePhaseModelByTier } from '../routing.js';

const FALLBACK_FULL = {
  model: 'gpt-5.4',
  useReasoning: false,
  reasoningModel: '',
  thinking: true,
  thinkingEffort: 'xhigh',
  webSearch: true,
};
const EMPTY_TIER = {
  model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false,
};
const EASY_CUSTOM = {
  model: 'gemini-2.5-flash',
  useReasoning: true,
  reasoningModel: 'gemini-2.5-pro',
  thinking: false,
  thinkingEffort: 'low',
  webSearch: false,
};

function policyOf(tiers, modelsPlan = 'deepseek-chat') {
  return { keyFinderTiers: tiers, models: { plan: modelsPlan } };
}

test('tier with its own model → returns that tier bundle verbatim', () => {
  const policy = policyOf({ easy: EASY_CUSTOM, medium: EMPTY_TIER, hard: EMPTY_TIER, very_hard: EMPTY_TIER, fallback: FALLBACK_FULL });
  const r = resolvePhaseModelByTier(policy, 'easy');
  assert.equal(r.model, 'gemini-2.5-flash');
  assert.equal(r.useReasoning, true);
  assert.equal(r.reasoningModel, 'gemini-2.5-pro');
  assert.equal(r.thinking, false);
  assert.equal(r.thinkingEffort, 'low');
  assert.equal(r.webSearch, false);
});

test('empty tier → inherits the entire fallback bundle (not per-field merge)', () => {
  const policy = policyOf({ easy: EMPTY_TIER, medium: EMPTY_TIER, hard: EMPTY_TIER, very_hard: EMPTY_TIER, fallback: FALLBACK_FULL });
  const r = resolvePhaseModelByTier(policy, 'medium');
  assert.equal(r.model, 'gpt-5.4');
  assert.equal(r.thinking, true);
  assert.equal(r.thinkingEffort, 'xhigh');
  assert.equal(r.webSearch, true);
});

test('unknown difficulty → falls through to fallback', () => {
  const policy = policyOf({ easy: EASY_CUSTOM, medium: EMPTY_TIER, hard: EMPTY_TIER, very_hard: EMPTY_TIER, fallback: FALLBACK_FULL });
  const r = resolvePhaseModelByTier(policy, 'expert');
  assert.equal(r.model, 'gpt-5.4');
});

test('fallback has empty model → last-resort uses policy.models.plan', () => {
  const policy = policyOf({ easy: EMPTY_TIER, medium: EMPTY_TIER, hard: EMPTY_TIER, very_hard: EMPTY_TIER, fallback: EMPTY_TIER }, 'deepseek-chat');
  const r = resolvePhaseModelByTier(policy, 'easy');
  assert.equal(r.model, 'deepseek-chat');
  assert.equal(r.thinking, false);
  assert.equal(r.thinkingEffort, '');
});

test('missing keyFinderTiers object → last-resort plan model, all flags false', () => {
  const r = resolvePhaseModelByTier({ models: { plan: 'claude-haiku-4-5' } }, 'hard');
  assert.equal(r.model, 'claude-haiku-4-5');
  assert.equal(r.useReasoning, false);
  assert.equal(r.thinking, false);
  assert.equal(r.webSearch, false);
});

test('null/undefined difficulty → treated as empty → cascades to fallback', () => {
  const policy = policyOf({ easy: EMPTY_TIER, medium: EMPTY_TIER, hard: EMPTY_TIER, very_hard: EMPTY_TIER, fallback: FALLBACK_FULL });
  assert.equal(resolvePhaseModelByTier(policy, null).model, 'gpt-5.4');
  assert.equal(resolvePhaseModelByTier(policy, undefined).model, 'gpt-5.4');
  assert.equal(resolvePhaseModelByTier(policy, '').model, 'gpt-5.4');
});

test('return shape is always the 6-field bundle', () => {
  const r = resolvePhaseModelByTier({}, 'easy');
  assert.deepEqual(Object.keys(r).sort(), ['model', 'reasoningModel', 'thinking', 'thinkingEffort', 'useReasoning', 'webSearch']);
});

// WHY: Common GUI flow — user toggles "use reasoning" and picks a reasoning
// model but leaves the base model field empty. Without this fix the cascade
// silently drops the user's tier choice and falls through to the fallback
// bundle, leading to "every Loop runs the fallback model" reports.
test('tier with empty model BUT useReasoning=true + reasoningModel set → tier WINS, not fallback', () => {
  const REASONING_ONLY = {
    model: '',
    useReasoning: true,
    reasoningModel: 'lab-openai:gpt-5.4-mini',
    thinking: true,
    thinkingEffort: 'xhigh',
    webSearch: true,
  };
  const policy = policyOf({
    easy: REASONING_ONLY, medium: REASONING_ONLY, hard: REASONING_ONLY,
    very_hard: REASONING_ONLY, fallback: FALLBACK_FULL,
  });
  const r = resolvePhaseModelByTier(policy, 'medium');
  assert.equal(r.useReasoning, true, 'inherits the tier reasoning toggle');
  assert.equal(r.reasoningModel, 'lab-openai:gpt-5.4-mini', 'tier reasoningModel wins');
  assert.equal(r.thinking, true, 'tier capabilities preserved (NOT fallback.thinking)');
  assert.equal(r.thinkingEffort, 'xhigh');
  assert.equal(r.webSearch, true);
  // model field is empty because user opted into reasoningModel — keyLlmAdapter
  // routes modelOverride to reasoningModel when useReasoning=true.
  assert.equal(r.model, 'deepseek-chat', 'last-resort policy.models.plan when tier model is empty');
});

test('tier with useReasoning=true but reasoningModel empty → still cascades to fallback', () => {
  // Defensive: a tier that opts into reasoning without choosing a reasoning
  // model is incomplete. The cascade should still fire so the user sees the
  // fallback model rather than a silent crash.
  const INCOMPLETE = { ...EMPTY_TIER, useReasoning: true };
  const policy = policyOf({
    easy: INCOMPLETE, medium: EMPTY_TIER, hard: EMPTY_TIER,
    very_hard: EMPTY_TIER, fallback: FALLBACK_FULL,
  });
  const r = resolvePhaseModelByTier(policy, 'easy');
  assert.equal(r.model, 'gpt-5.4', 'cascaded to fallback because reasoningModel is empty');
  assert.equal(r.useReasoning, false, 'inherits fallback.useReasoning');
});
