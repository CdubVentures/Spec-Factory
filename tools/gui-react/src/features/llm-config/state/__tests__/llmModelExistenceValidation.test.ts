import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { validateModelExistence } from '../llmModelValidation.ts';

function makeRegistry(modelIds: string[] = ['gemini-2.5-flash-lite', 'gpt-5-medium']) {
  return [
    {
      id: 'test-provider',
      name: 'Test Provider',
      type: 'openai-compatible',
      baseUrl: 'https://api.test.com',
      apiKey: 'sk-test',
      models: modelIds.map((modelId) => ({
        id: `model-${modelId}`,
        modelId,
        role: 'primary' as const,
        costInputPer1M: 0.5,
        costOutputPer1M: 1.0,
        costCachedPer1M: 0.25,
        maxContextTokens: 128000,
        maxOutputTokens: 8192,
      })),
    },
  ];
}

describe('validateModelExistence', () => {
  it('returns empty array when all models exist', () => {
    const issues = validateModelExistence(
      { llmModelPlan: 'gemini-2.5-flash-lite' },
      makeRegistry(),
    );
    deepStrictEqual(issues, []);
  });

  it('returns issue for model not in registry', () => {
    const issues = validateModelExistence(
      { llmModelPlan: '_test_invalid_model_' },
      makeRegistry(),
    );
    strictEqual(issues.length, 1);
    strictEqual(issues[0].severity, 'error');
    strictEqual(issues[0].key, 'invalid-model-llmModelPlan');
  });

  it('skips empty model values', () => {
    const issues = validateModelExistence(
      { llmModelPlan: '', llmPlanFallbackModel: '' },
      makeRegistry(),
    );
    deepStrictEqual(issues, []);
  });

  it('reports multiple invalid models', () => {
    const issues = validateModelExistence(
      { llmModelPlan: 'bogus-a', llmModelReasoning: 'bogus-b' },
      makeRegistry(),
    );
    strictEqual(issues.length, 2);
  });

  it('handles empty registry', () => {
    const issues = validateModelExistence(
      { llmModelPlan: 'gemini-2.5-flash-lite' },
      [],
    );
    strictEqual(issues.length, 1);
  });
});
