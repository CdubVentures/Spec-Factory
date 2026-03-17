import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { validatePhaseTokenLimits } from '../llmTokenLimitValidation.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';

function makeProvider(overrides: Partial<LlmProviderEntry> & { id: string; name: string }): LlmProviderEntry {
  return {
    type: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    enabled: true,
    expanded: false,
    models: [],
    ...overrides,
  };
}

function makeModel(modelId: string, maxOutputTokens: number | null = null) {
  return {
    id: `m-${modelId}`,
    modelId,
    role: 'primary' as const,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costCachedPer1M: 0,
    maxContextTokens: null,
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
});
