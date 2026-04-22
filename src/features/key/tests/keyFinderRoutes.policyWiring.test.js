// WHY: Root-cause regression — gui users who configured a per-tier model in the
// Key Finder LLM panel still saw every run route to gemini-2.5-flash. Cause:
// the route handler built `commonOpts` for runKeyFinder without passing the
// hydrated policy, so `config.keyFinderTiers` (never populated) fell through
// to `llmModelPlan` (default "gemini-2.5-flash"). This test locks the wiring:
// the common-opts builder MUST thread `config._llmPolicy` as `policy`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKeyFinderCommonOpts } from '../api/keyFinderRoutes.js';

const TIER_BUNDLES = {
  easy:      { model: 'gpt-5.4-mini', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '',      webSearch: true  },
  medium:    { model: 'gpt-5.4',      useReasoning: false, reasoningModel: '', thinking: true,  thinkingEffort: 'high',  webSearch: true  },
  hard:      { model: 'gpt-5.4',      useReasoning: true,  reasoningModel: 'gpt-5.4-mini', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
  very_hard: { model: 'deepseek-chat', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
  fallback:  { model: 'gpt-5.4',      useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
};

const LLM_POLICY = Object.freeze({
  keyFinderTiers: TIER_BUNDLES,
  models: { plan: 'gpt-5.4' },
});

function makeInputs({ configOverride } = {}) {
  return {
    product: { product_id: 'p1', brand: 'Razer', model: 'DeathAdder V3', category: 'mouse' },
    fieldKey: 'polling_rate',
    category: 'mouse',
    specDb: { /* stub — not inspected by builder */ },
    appDb: null,
    config: configOverride ?? { _llmPolicy: LLM_POLICY, productRoot: '/tmp/x' },
    logger: null,
    signal: null,
    broadcastWs: null,
  };
}

test('buildKeyFinderCommonOpts threads config._llmPolicy as policy (bug regression)', () => {
  const opts = buildKeyFinderCommonOpts(makeInputs());
  assert.equal(opts.policy, LLM_POLICY,
    'policy must be the same reference as config._llmPolicy; without this, keyFinder falls back to llmModelPlan (gemini-2.5-flash)');
});

test('buildKeyFinderCommonOpts.policy exposes the tier bundles for runKeyFinder to read', () => {
  const opts = buildKeyFinderCommonOpts(makeInputs());
  assert.equal(opts.policy.keyFinderTiers.medium.model, 'gpt-5.4');
  assert.equal(opts.policy.keyFinderTiers.very_hard.model, 'deepseek-chat');
  assert.equal(opts.policy.keyFinderTiers.fallback.model, 'gpt-5.4');
});

test('buildKeyFinderCommonOpts returns null policy when _llmPolicy missing (boot / non-assembled config)', () => {
  const opts = buildKeyFinderCommonOpts(makeInputs({ configOverride: { productRoot: '/tmp/x' } }));
  assert.equal(opts.policy, null,
    'missing _llmPolicy must surface as null so runKeyFinder falls back to its config-derived default (not undefined which would look like an error)');
});

test('buildKeyFinderCommonOpts passes through product / fieldKey / category / db handles / productRoot unchanged', () => {
  const inputs = makeInputs();
  const opts = buildKeyFinderCommonOpts(inputs);
  assert.equal(opts.product, inputs.product);
  assert.equal(opts.fieldKey, 'polling_rate');
  assert.equal(opts.category, 'mouse');
  assert.equal(opts.specDb, inputs.specDb);
  assert.equal(opts.appDb, null);
  assert.equal(opts.config, inputs.config);
  assert.equal(opts.productRoot, '/tmp/x', 'productRoot flows from config.productRoot');
});
