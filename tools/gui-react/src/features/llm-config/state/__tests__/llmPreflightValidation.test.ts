import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { validateLlmConfigForRun, type PreflightResult } from '../llmPreflightValidation.ts';
import type { LlmProviderEntry } from '../../types/llmProviderRegistryTypes.ts';
import type { RuntimeApiKeySlice } from '../llmProviderApiKeyGate.ts';

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

function emptyKeys(): RuntimeApiKeySlice {
  return {
    geminiApiKey: '',
    deepseekApiKey: '',
    anthropicApiKey: '',
    openaiApiKey: '',
    llmPlanApiKey: '',
  };
}

const validDraft: Record<string, unknown> = {
  llmModelPlan: 'gpt-4o',
  llmModelReasoning: 'gpt-4o',
  llmMaxOutputTokensPlan: 4096,
  llmMaxOutputTokensReasoning: 4096,
};

const validRegistry = [
  makeProvider({
    id: 'p1',
    name: 'P',
    apiKey: 'sk-key',
    models: [makeModel('gpt-4o', 16384)],
  }),
];

describe('validateLlmConfigForRun', () => {
  it('happy path — valid:true, no issues', () => {
    const result = validateLlmConfigForRun(validDraft, validRegistry, emptyKeys());
    strictEqual(result.valid, true);
    strictEqual(result.issues.length, 0);
  });

  it('empty model → valid:false, error', () => {
    const draft = { ...validDraft, llmModelPlan: '' };
    const result = validateLlmConfigForRun(draft, validRegistry, emptyKeys());
    strictEqual(result.valid, false);
    const errors = result.issues.filter((i) => i.severity === 'error');
    strictEqual(errors.length >= 1, true);
    strictEqual(errors.some((e) => e.key.includes('empty-model')), true);
  });

  it('missing API key → valid:false, error', () => {
    const noKeyRegistry = [
      makeProvider({
        id: 'default-gemini',
        name: 'Gemini',
        models: [makeModel('gpt-4o', 16384)],
      }),
    ];
    const result = validateLlmConfigForRun(validDraft, noKeyRegistry, emptyKeys());
    strictEqual(result.valid, false);
    const errors = result.issues.filter((i) => i.severity === 'error');
    strictEqual(errors.length >= 1, true);
    strictEqual(errors.some((e) => e.key.includes('missing-api-key')), true);
  });

  it('token cap exceeds limit → valid:true, warning (warnings do not block)', () => {
    const draft = { ...validDraft, llmMaxOutputTokensPlan: 99999 };
    const result = validateLlmConfigForRun(draft, validRegistry, emptyKeys());
    strictEqual(result.valid, true);
    const warnings = result.issues.filter((i) => i.severity === 'warning');
    strictEqual(warnings.length >= 1, true);
  });

  it('local provider (ollama) → valid:true without key', () => {
    const localRegistry = [
      makeProvider({
        id: 'local-ollama',
        name: 'Ollama',
        type: 'ollama',
        models: [makeModel('gpt-4o', 16384)],
      }),
    ];
    const result = validateLlmConfigForRun(validDraft, localRegistry, emptyKeys());
    strictEqual(result.valid, true);
  });

  it('multi-issue accumulation', () => {
    const draft = { ...validDraft, llmModelPlan: '', llmModelReasoning: '' };
    const result = validateLlmConfigForRun(draft, validRegistry, emptyKeys());
    strictEqual(result.valid, false);
    strictEqual(result.issues.length >= 2, true);
  });
});
