import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import { detectStaleModelIssues } from '../llmMixDetection.ts';
import { makeModel, makeProvider } from './fixtures/llmMixDetectionFixtures.ts';

describe('detectStaleModelIssues contracts', () => {
  it('ignores empty, known, and enabled-registry-backed models', () => {
    const cases = [
      {
        name: 'enabled registry models do not warn',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            models: [makeModel('gpt-4o')],
          }),
        ],
        modelFields: { llmModelPlan: 'gpt-4o' },
        knownModelOptions: undefined,
      },
      {
        name: 'empty model fields are ignored',
        registry: [],
        modelFields: { llmModelPlan: '' },
        knownModelOptions: undefined,
      },
      {
        name: 'known model options suppress stale warnings even without registry entries',
        registry: [],
        modelFields: { llmModelPlan: 'gpt-4o' },
        knownModelOptions: ['gpt-4o', 'claude-sonnet'],
      },
    ];

    for (const row of cases) {
      strictEqual(
        detectStaleModelIssues(row.registry, row.modelFields, row.knownModelOptions).length,
        0,
        row.name,
      );
    }
  });

  it('warns for stale models from missing, disabled, or multiply-missing providers', () => {
    const cases = [
      {
        name: 'missing models warn with field-scoped keys',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            models: [makeModel('gpt-4o')],
          }),
        ],
        modelFields: { llmModelPlan: 'deleted-model' },
        knownModelOptions: undefined,
        expectedKeys: ['stale-model-llmModelPlan'],
      },
      {
        name: 'disabled providers still count as stale',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            enabled: false,
            models: [makeModel('gpt-4o')],
          }),
        ],
        modelFields: { llmModelPlan: 'gpt-4o' },
        knownModelOptions: undefined,
        expectedKeys: ['stale-model-llmModelPlan'],
      },
      {
        name: 'multiple stale models accumulate independently',
        registry: [],
        modelFields: { llmModelPlan: 'gone-a', llmModelReasoning: 'gone-b' },
        knownModelOptions: undefined,
        expectedKeys: ['stale-model-llmModelPlan', 'stale-model-llmModelReasoning'],
      },
    ];

    for (const row of cases) {
      deepStrictEqual(
        detectStaleModelIssues(row.registry, row.modelFields, row.knownModelOptions).map((issue) => issue.key),
        row.expectedKeys,
        row.name,
      );
    }
  });
});
