import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { validatePhaseTokenLimits } from '../llmTokenLimitValidation.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';

function makeProvider(overrides: Partial<LlmProviderEntry> & { id: string; name: string }): LlmProviderEntry {
  return {
    type: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    expanded: false,
    models: [],
    ...overrides,
  };
}

function makeModel(
  modelId: string,
  maxOutputTokens: number | null = null,
  maxContextTokens: number | null = null,
) {
  return {
    id: `m-${modelId}`,
    modelId,
    role: 'primary' as const,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costCachedPer1M: 0,
    maxContextTokens,
    maxOutputTokens,
  };
}

describe('validatePhaseTokenLimits', () => {
  it('no warnings when within limits', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('gpt-4o', 16384)],
      }),
    ];
    const draft = {
      llmModelPlan: 'gpt-4o',
      llmMaxOutputTokensPlan: 8192,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    deepStrictEqual(warnings, []);
  });

  it('warning when llmMaxOutputTokensPlan exceeds model maxOutput', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('small-model', 2048)],
      }),
    ];
    const draft = {
      llmModelPlan: 'small-model',
      llmMaxOutputTokensPlan: 4096,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    strictEqual(warnings.length, 1);
    deepStrictEqual(warnings[0], {
      phase: 'Plan',
      model: 'small-model',
      setting: 4096,
      limit: 2048,
      field: 'maxOutput',
    });
  });

  it('no warning when model maxOutputTokens is null (unknown limit)', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('unknown-model', null)],
      }),
    ];
    const draft = {
      llmModelPlan: 'unknown-model',
      llmMaxOutputTokensPlan: 999999,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    deepStrictEqual(warnings, []);
  });

  it('multiple phases can each produce warnings', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('tiny', 1024)],
      }),
    ];
    const draft = {
      llmModelPlan: 'tiny',
      llmMaxOutputTokensPlan: 2048,
      llmModelReasoning: 'tiny',
      llmMaxOutputTokensReasoning: 4096,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    strictEqual(warnings.length, 2);
    strictEqual(warnings[0].phase, 'Plan');
    strictEqual(warnings[1].phase, 'Reasoning');
  });

  it('no warning when token setting is zero', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('gpt-4o', 2048)],
      }),
    ];
    const draft = {
      llmModelPlan: 'gpt-4o',
      llmMaxOutputTokensPlan: 0,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    deepStrictEqual(warnings, []);
  });

  it('no warning when model is not in registry', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('gpt-4o', 2048)],
      }),
    ];
    const draft = {
      llmModelPlan: 'unknown-model',
      llmMaxOutputTokensPlan: 4096,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    deepStrictEqual(warnings, []);
  });

  it('exact limit does not trigger warning', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('gpt-4o', 4096)],
      }),
    ];
    const draft = {
      llmModelPlan: 'gpt-4o',
      llmMaxOutputTokensPlan: 4096,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    deepStrictEqual(warnings, []);
  });

  it('warns when output allocation exceeds 50% of maxContextTokens', () => {
    // Model has 8192 context window. 50% threshold = 4096.
    // Setting output to 5000 should trigger contextOverflow.
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('ctx-model', 16384, 8192)],
      }),
    ];
    const draft = {
      llmModelPlan: 'ctx-model',
      llmMaxOutputTokensPlan: 5000,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    const ctxWarnings = warnings.filter((w) => w.field === 'contextOverflow');
    strictEqual(ctxWarnings.length, 1);
    strictEqual(ctxWarnings[0].phase, 'Plan');
    strictEqual(ctxWarnings[0].model, 'ctx-model');
    strictEqual(ctxWarnings[0].setting, 5000);
    strictEqual(ctxWarnings[0].limit, 8192);
  });

  it('no contextOverflow warning when output is within 50% of context', () => {
    // Model has 8192 context. 50% = 4096. Setting 4000 is under threshold.
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('ctx-model', 16384, 8192)],
      }),
    ];
    const draft = {
      llmModelPlan: 'ctx-model',
      llmMaxOutputTokensPlan: 4000,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    const ctxWarnings = warnings.filter((w) => w.field === 'contextOverflow');
    strictEqual(ctxWarnings.length, 0);
  });

  it('no contextOverflow warning when model has no maxContextTokens', () => {
    // maxContextTokens is null — cannot compute threshold
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('no-ctx', 16384, null)],
      }),
    ];
    const draft = {
      llmModelPlan: 'no-ctx',
      llmMaxOutputTokensPlan: 999999,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    const ctxWarnings = warnings.filter((w) => w.field === 'contextOverflow');
    strictEqual(ctxWarnings.length, 0);
  });

  it('exact 50% boundary does not trigger contextOverflow', () => {
    // 50% of 8192 = 4096. Setting exactly 4096 should NOT warn.
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('boundary-model', 16384, 8192)],
      }),
    ];
    const draft = {
      llmModelPlan: 'boundary-model',
      llmMaxOutputTokensPlan: 4096,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    const ctxWarnings = warnings.filter((w) => w.field === 'contextOverflow');
    strictEqual(ctxWarnings.length, 0);
  });

  it('both maxOutput and contextOverflow warnings can fire simultaneously', () => {
    // maxOutput = 4096, context = 6000. Setting = 5000.
    // 5000 > 4096 (maxOutput warning), and 5000 > 6000*0.5=3000 (contextOverflow warning).
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'P',
        models: [makeModel('dual-warn', 4096, 6000)],
      }),
    ];
    const draft = {
      llmModelPlan: 'dual-warn',
      llmMaxOutputTokensPlan: 5000,
    };
    const warnings = validatePhaseTokenLimits(draft, registry);
    const maxOutputWarnings = warnings.filter((w) => w.field === 'maxOutput');
    const ctxWarnings = warnings.filter((w) => w.field === 'contextOverflow');
    strictEqual(maxOutputWarnings.length, 1);
    strictEqual(ctxWarnings.length, 1);
  });
});
