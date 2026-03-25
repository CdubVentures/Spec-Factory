import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import { detectMixIssues } from '../llmMixDetection.ts';
import {
  makeDefaults,
  makeModel,
  makeProvider,
} from './fixtures/llmMixDetectionFixtures.ts';

describe('detectMixIssues contracts', () => {
  it('emits the expected warning and error families for the supported mix scenarios', () => {
    const cases = [
      {
        name: 'empty registry leaves only fallback information issues',
        registry: [],
        defaults: makeDefaults(),
        key: 'no-base-fallback',
        severity: 'info',
        ringFields: ['llmPlanFallbackModel'],
      },
      {
        name: 'cross-provider base vs reasoning warns',
        registry: [
          makeProvider({
            id: 'p-openai',
            name: 'OpenAI',
            models: [makeModel('gpt-4o')],
          }),
          makeProvider({
            id: 'p-anthropic',
            name: 'Anthropic',
            type: 'anthropic',
            models: [makeModel('claude-sonnet')],
          }),
        ],
        defaults: makeDefaults({
          llmModelPlan: 'gpt-4o',
          llmModelReasoning: 'claude-sonnet',
        }),
        key: 'cross-provider-base-reasoning',
        severity: 'warning',
        ringFields: ['llmModelPlan', 'llmModelReasoning'],
      },
      {
        name: 'base fallback matching the base model errors',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            models: [makeModel('gpt-4o')],
          }),
        ],
        defaults: makeDefaults({
          llmModelPlan: 'gpt-4o',
          llmPlanFallbackModel: 'gpt-4o',
        }),
        key: 'fallback-same-as-base',
        severity: 'error',
        ringFields: ['llmPlanFallbackModel'],
      },
      {
        name: 'reasoning fallback matching the reasoning model errors',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'Anthropic',
            type: 'anthropic',
            models: [makeModel('claude-sonnet', 'reasoning')],
          }),
        ],
        defaults: makeDefaults({
          llmModelReasoning: 'claude-sonnet',
          llmReasoningFallbackModel: 'claude-sonnet',
        }),
        key: 'reasoning-fallback-same-as-reasoning',
        severity: 'error',
        ringFields: ['llmReasoningFallbackModel'],
      },
      {
        name: 'same-provider fallback warns about weak redundancy',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            models: [makeModel('gpt-4o'), makeModel('gpt-4o-mini')],
          }),
        ],
        defaults: makeDefaults({
          llmModelPlan: 'gpt-4o',
          llmPlanFallbackModel: 'gpt-4o-mini',
        }),
        key: 'same-provider-fallback',
        severity: 'warning',
        ringFields: ['llmModelPlan', 'llmPlanFallbackModel'],
      },
      {
        name: 'local and remote fallback chains warn',
        registry: [
          makeProvider({
            id: 'p-remote',
            name: 'OpenAI',
            type: 'openai-compatible',
            models: [makeModel('gpt-4o')],
          }),
          makeProvider({
            id: 'p-local',
            name: 'Local LLM',
            type: 'ollama',
            models: [makeModel('llama3')],
          }),
        ],
        defaults: makeDefaults({
          llmModelPlan: 'gpt-4o',
          llmPlanFallbackModel: 'llama3',
        }),
        key: 'local-remote-mix',
        severity: 'warning',
        ringFields: ['llmModelPlan', 'llmPlanFallbackModel'],
      },
      {
        name: 'different API formats emit info',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            type: 'openai-compatible',
            models: [makeModel('gpt-4o')],
          }),
          makeProvider({
            id: 'p2',
            name: 'Anthropic',
            type: 'anthropic',
            models: [makeModel('claude-sonnet')],
          }),
        ],
        defaults: makeDefaults({
          llmModelPlan: 'gpt-4o',
          llmModelReasoning: 'claude-sonnet',
        }),
        key: 'different-api-formats',
        severity: 'info',
        ringFields: ['llmModelPlan', 'llmModelReasoning'],
      },
    ];

    for (const row of cases) {
      const issues = detectMixIssues(row.registry, row.defaults);
      const issue = issues.find((entry) => entry.key === row.key);

      strictEqual(issue !== undefined, true, row.name);
      strictEqual(issue?.severity, row.severity, row.name);
      deepStrictEqual(issue?.ringFields, row.ringFields, row.name);
    }
  });

  it('only emits fallback information issues when no stronger mix issue applies', () => {
    const cases = [
      {
        name: 'empty registry emits both fallback info issues',
        registry: [],
        defaults: makeDefaults(),
        expectedKeys: ['no-base-fallback', 'no-reasoning-fallback'],
      },
      {
        name: 'same-provider same-type models avoid cross-provider and api-format warnings',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            type: 'openai-compatible',
            models: [makeModel('gpt-4o'), makeModel('gpt-4o-mini')],
          }),
        ],
        defaults: makeDefaults({
          llmModelPlan: 'gpt-4o',
          llmModelReasoning: 'gpt-4o-mini',
        }),
        expectedKeys: ['no-base-fallback', 'no-reasoning-fallback'],
      },
      {
        name: 'disabled providers stay invisible to provider-resolution warnings',
        registry: [
          makeProvider({
            id: 'p1',
            name: 'OpenAI',
            enabled: false,
            models: [makeModel('gpt-4o')],
          }),
        ],
        defaults: makeDefaults({
          llmModelPlan: 'gpt-4o',
        }),
        expectedKeys: ['no-base-fallback', 'no-reasoning-fallback'],
      },
    ];

    for (const row of cases) {
      deepStrictEqual(
        detectMixIssues(row.registry, row.defaults).map((issue) => issue.key),
        row.expectedKeys,
        row.name,
      );
    }
  });
});
