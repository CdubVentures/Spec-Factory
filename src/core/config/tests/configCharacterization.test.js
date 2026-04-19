import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../../config.js';

const RETIRED_MODEL_KEYS = [
  'llmModelTriage',
  'llmModelValidate',
  'llmModelWrite',
  'llmExtractFallbackModel',
  'llmValidateFallbackModel',
  'llmWriteFallbackModel',
];

function makeResolvedConfig(overrides = {}) {
  return loadConfig(overrides);
}

test('config: loadConfig exposes the public runtime and llm contract surface', () => {
  const cfg = makeResolvedConfig();

  assert.equal(typeof cfg.localInputRoot, 'string');
  assert.equal(typeof cfg.localOutputRoot, 'string');

  assert.equal(typeof cfg.llmModelPlan, 'string');
  assert.equal(typeof cfg.llmModelReasoning, 'string');
  assert.equal(typeof cfg.llmProvider, 'string');
  assert.ok(cfg.llmModelPlan.length > 0);
  assert.ok(cfg.llmModelReasoning.length > 0);

  assert.equal(typeof cfg.llmMaxOutputTokens, 'number');
  assert.equal(typeof cfg.llmMaxOutputTokensPlan, 'number');

  assert.ok(Array.isArray(cfg.llmOutputTokenPresets));
  assert.ok(cfg.llmOutputTokenPresets.length > 0);

  assert.equal(typeof cfg.searchProfileCapMap, 'object');
  assert.ok(cfg.searchProfileCapMap !== null);
  assert.equal(typeof cfg.searchProfileCapMap.deterministicAliasCap, 'number');

  assert.equal(typeof cfg.retrievalInternalsMap, 'object');
  assert.ok(cfg.retrievalInternalsMap !== null);
  assert.equal(typeof cfg.retrievalInternalsMap.evidenceTierWeightMultiplier, 'number');

  assert.equal(typeof cfg.llmModelPricingMap, 'object');
  assert.ok(cfg.llmModelPricingMap !== null);

  assert.equal(typeof cfg.llmModelOutputTokenMap, 'object');
  assert.ok(cfg.llmModelOutputTokenMap !== null);
  assert.ok(Object.keys(cfg.llmModelOutputTokenMap).length > 0);

  assert.equal(typeof cfg.runtimeScreencastEnabled, 'boolean');
});

test('config: resolved OpenAI aliases mirror the resolved llm settings', () => {
  const cfg = makeResolvedConfig();

  assert.equal(cfg.openaiBaseUrl, cfg.llmBaseUrl);
  assert.equal(cfg.openaiModelPlan, cfg.llmModelPlan);
});

test('config: token profile map stays usable for active resolved models', () => {
  const cfg = makeResolvedConfig();
  const map = cfg.llmModelOutputTokenMap;

  for (const model of new Set([cfg.llmModelPlan, cfg.llmModelReasoning])) {
    assert.ok(model in map, `${model} should be in llmModelOutputTokenMap`);
    assert.equal(typeof map[model].defaultOutputTokens, 'number');
    assert.equal(typeof map[model].maxOutputTokens, 'number');
    assert.ok(map[model].defaultOutputTokens > 0, `${model} defaultOutputTokens should be > 0`);
    assert.ok(map[model].maxOutputTokens > 0, `${model} maxOutputTokens should be > 0`);
    assert.ok(
      map[model].maxOutputTokens >= map[model].defaultOutputTokens,
      `${model} maxOutputTokens should be >= defaultOutputTokens`,
    );
  }
});

test('config: token chain resolves to non-negative numbers', () => {
  const cfg = makeResolvedConfig();
  const tokenKeys = [
    'llmMaxOutputTokensPlan',
    'llmMaxOutputTokensReasoning',
  ];

  for (const key of tokenKeys) {
    assert.equal(typeof cfg[key], 'number', `${key} must be a number`);
    assert.ok(cfg[key] >= 0, `${key} must be >= 0`);
  }
});

test('config: explicit overrides win and undefined overrides are ignored', () => {
  const overridden = makeResolvedConfig({ domainClassifierUrlCap: 11 });
  assert.equal(overridden.domainClassifierUrlCap, 11);

  const defaulted = makeResolvedConfig({ domainClassifierUrlCap: undefined });
  assert.ok(defaulted.domainClassifierUrlCap > 0);
});

test('config: retired per-role model and fallback aliases stay off the public surface', () => {
  const cfg = makeResolvedConfig();

  for (const key of RETIRED_MODEL_KEYS) {
    assert.equal(cfg[key], undefined, `${key} should not exist on the config surface`);
  }

  assert.equal(typeof cfg.llmModelExtract, 'string');
  assert.equal(typeof cfg.llmModelReasoning, 'string');
});

test('config: explicit plan and reasoning overrides remain independent', () => {
  const cfg = makeResolvedConfig({
    llmModelPlan: 'test-model-xyz',
    llmModelReasoning: 'test-reasoning-model',
  });

  assert.equal(cfg.llmModelPlan, 'test-model-xyz');
  assert.equal(cfg.llmModelReasoning, 'test-reasoning-model');
});

test('config: surviving triage token cap remains on the public surface', () => {
  const cfg = makeResolvedConfig();

  assert.equal(typeof cfg.llmMaxOutputTokensTriage, 'number');
});
