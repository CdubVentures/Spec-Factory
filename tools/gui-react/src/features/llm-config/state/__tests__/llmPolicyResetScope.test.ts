import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

type Patch = Record<string, unknown>;

let buildLlmGlobalDefaultsResetPatch: (defaults: any, current: any) => Patch;
let buildLlmPhaseOverrideResetPatch: (overrideKey: string, current: any) => Patch;
let buildLlmResetAllPatch: (args: {
  defaults: any;
  current: any;
  freshRegistry: any[];
  providerApiKeyMap: Record<string, string>;
}) => Patch;

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/features/llm-config/state/llmPolicyResetScope.ts',
    { prefix: 'llm-policy-reset-scope-' },
  );
  ({
    buildLlmGlobalDefaultsResetPatch,
    buildLlmPhaseOverrideResetPatch,
    buildLlmResetAllPatch,
  } = mod);
});

function makeDefaults() {
  return {
    apiKeys: { anthropic: '', deepseek: '', gemini: '', openai: '' },
    provider: { baseUrl: 'default-url', id: 'gemini' },
    budget: { costCachedInputPer1M: 0, costInputPer1M: 0, costOutputPer1M: 0 },
    tokens: { maxOutput: 1400, plan: 4096, triage: 20000, reasoning: 4096, maxTokens: 16384 },
    models: { plan: 'default-plan', reasoning: 'default-reasoning', planFallback: '', reasoningFallback: '' },
    reasoning: { enabled: false, budget: 32768, mode: true },
    phaseOverrides: {},
    providerRegistry: [],
    keyFinderTiers: {},
    labQueueDelayMs: 1000,
    timeoutMs: 30000,
  };
}

function makeCurrentWithEdits() {
  return {
    apiKeys: { anthropic: 'ANTH', deepseek: 'DEEP', gemini: 'GEM', openai: 'OAI' },
    provider: { baseUrl: 'user-url', id: 'gemini' },
    budget: { costCachedInputPer1M: 9, costInputPer1M: 9, costOutputPer1M: 9 },
    tokens: { maxOutput: 9999, plan: 8000, triage: 99999, reasoning: 9000, maxTokens: 999999 },
    models: { plan: 'user-plan', reasoning: 'user-reasoning', planFallback: 'x', reasoningFallback: 'y' },
    reasoning: { enabled: true, budget: 65536, mode: false },
    phaseOverrides: { writer: { baseModel: 'writer-m' }, needset: { useReasoning: true } },
    providerRegistry: [
      { id: 'default-gemini', apiKey: 'GEM-REGISTRY' },
      { id: 'default-deepseek', apiKey: '' },
    ],
    keyFinderTiers: { tierA: 1 },
    labQueueDelayMs: 5000,
    timeoutMs: 600000,
  };
}

describe('buildLlmGlobalDefaultsResetPatch', () => {
  it('resets only the 5 inherited defaults (plan, maxTokens, timeout, reasoning.budget, labQueueDelayMs)', () => {
    const defaults = makeDefaults();
    const current = makeCurrentWithEdits();
    const patch = buildLlmGlobalDefaultsResetPatch(defaults, current) as any;

    assert.equal(patch.tokens.plan, 4096);
    assert.equal(patch.tokens.maxTokens, 16384);
    assert.equal(patch.reasoning.budget, 32768);
    assert.equal(patch.timeoutMs, 30000);
    assert.equal(patch.labQueueDelayMs, 1000);
  });

  it('preserves other tokens fields (triage, reasoning, maxOutput)', () => {
    const defaults = makeDefaults();
    const current = makeCurrentWithEdits();
    const patch = buildLlmGlobalDefaultsResetPatch(defaults, current) as any;

    assert.equal(patch.tokens.triage, current.tokens.triage);
    assert.equal(patch.tokens.reasoning, current.tokens.reasoning);
    assert.equal(patch.tokens.maxOutput, current.tokens.maxOutput);
  });

  it('preserves other reasoning fields (enabled, mode)', () => {
    const defaults = makeDefaults();
    const current = makeCurrentWithEdits();
    const patch = buildLlmGlobalDefaultsResetPatch(defaults, current) as any;

    assert.equal(patch.reasoning.enabled, current.reasoning.enabled);
    assert.equal(patch.reasoning.mode, current.reasoning.mode);
  });

  it('does not touch providers, models, API keys, or phase overrides', () => {
    const defaults = makeDefaults();
    const current = makeCurrentWithEdits();
    const patch = buildLlmGlobalDefaultsResetPatch(defaults, current) as any;

    assert.equal(patch.providerRegistry, undefined);
    assert.equal(patch.models, undefined);
    assert.equal(patch.apiKeys, undefined);
    assert.equal(patch.phaseOverrides, undefined);
    assert.equal(patch.budget, undefined);
  });
});

describe('buildLlmPhaseOverrideResetPatch', () => {
  it('removes the targeted phase override entry', () => {
    const current = makeCurrentWithEdits();
    const patch = buildLlmPhaseOverrideResetPatch('needset', current) as any;

    assert.equal(patch.phaseOverrides.needset, undefined);
  });

  it('leaves sibling phase overrides intact', () => {
    const current = makeCurrentWithEdits();
    const patch = buildLlmPhaseOverrideResetPatch('needset', current) as any;

    assert.deepEqual(patch.phaseOverrides.writer, current.phaseOverrides.writer);
  });

  it('is a no-op when the phase has no existing override', () => {
    const current = makeCurrentWithEdits();
    const patch = buildLlmPhaseOverrideResetPatch('colorFinder', current) as any;

    assert.equal(patch.phaseOverrides.colorFinder, undefined);
    assert.deepEqual(patch.phaseOverrides.writer, current.phaseOverrides.writer);
    assert.deepEqual(patch.phaseOverrides.needset, current.phaseOverrides.needset);
  });

  it('does not mutate the input phaseOverrides object', () => {
    const current = makeCurrentWithEdits();
    const originalKeys = Object.keys(current.phaseOverrides).sort();
    buildLlmPhaseOverrideResetPatch('needset', current);
    assert.deepEqual(Object.keys(current.phaseOverrides).sort(), originalKeys);
  });

  it('returns a patch scoped to phaseOverrides only', () => {
    const current = makeCurrentWithEdits();
    const patch = buildLlmPhaseOverrideResetPatch('needset', current) as any;

    assert.equal(patch.tokens, undefined);
    assert.equal(patch.models, undefined);
    assert.equal(patch.timeoutMs, undefined);
  });
});

describe('buildLlmResetAllPatch', () => {
  const providerApiKeyMap = {
    'default-gemini': 'geminiApiKey',
    'default-deepseek': 'deepseekApiKey',
    'default-anthropic': 'anthropicApiKey',
    'default-openai': 'openaiApiKey',
  };

  it('preserves API keys from the flat apiKeys slice', () => {
    const defaults = makeDefaults();
    const current = makeCurrentWithEdits();
    const freshRegistry = [
      { id: 'default-gemini', apiKey: '' },
      { id: 'default-deepseek', apiKey: '' },
      { id: 'default-anthropic', apiKey: '' },
      { id: 'default-openai', apiKey: '' },
    ];

    const patch = buildLlmResetAllPatch({ defaults, current, freshRegistry, providerApiKeyMap }) as any;

    assert.equal(patch.apiKeys.gemini, 'GEM');
    assert.equal(patch.apiKeys.deepseek, 'DEEP');
    assert.equal(patch.apiKeys.anthropic, 'ANTH');
    assert.equal(patch.apiKeys.openai, 'OAI');
  });

  it('preserves registry-stored apiKey on the corresponding provider entry', () => {
    const defaults = makeDefaults();
    const current = makeCurrentWithEdits();
    const freshRegistry = [
      { id: 'default-gemini', apiKey: '' },
      { id: 'default-deepseek', apiKey: '' },
    ];

    const patch = buildLlmResetAllPatch({ defaults, current, freshRegistry, providerApiKeyMap }) as any;

    const geminiEntry = patch.providerRegistry.find((p: any) => p.id === 'default-gemini');
    assert.equal(geminiEntry.apiKey, 'GEM-REGISTRY');
  });

  it('resets tokens/timeout/budget back to defaults', () => {
    const defaults = makeDefaults();
    const current = makeCurrentWithEdits();
    const patch = buildLlmResetAllPatch({
      defaults,
      current,
      freshRegistry: [],
      providerApiKeyMap,
    }) as any;

    assert.equal(patch.tokens.plan, defaults.tokens.plan);
    assert.equal(patch.timeoutMs, defaults.timeoutMs);
    assert.equal(patch.reasoning.budget, defaults.reasoning.budget);
    assert.equal(patch.labQueueDelayMs, defaults.labQueueDelayMs);
  });

  it('clears phaseOverrides', () => {
    const defaults = makeDefaults();
    const current = makeCurrentWithEdits();
    const patch = buildLlmResetAllPatch({
      defaults,
      current,
      freshRegistry: [],
      providerApiKeyMap,
    }) as any;

    assert.deepEqual(patch.phaseOverrides, {});
  });
});
