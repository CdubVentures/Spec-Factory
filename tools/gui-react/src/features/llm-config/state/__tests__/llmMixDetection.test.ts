import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { detectMixIssues, detectStaleModelIssues, resolveRingColor } from '../llmMixDetection.ts';
import type { MixIssue } from '../llmMixDetection.ts';
import type { LlmProviderEntry, LlmProviderType } from '../../types/llmProviderRegistryTypes.ts';

/* ------------------------------------------------------------------ */
/*  Factories                                                          */
/* ------------------------------------------------------------------ */

function makeProvider(
  overrides: Partial<LlmProviderEntry> & { id: string; name: string },
): LlmProviderEntry {
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

function makeModel(modelId: string, role: 'primary' | 'reasoning' | 'fast' | 'embedding' = 'primary') {
  return {
    id: `m-${modelId}`,
    modelId,
    role,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costCachedPer1M: 0,
    maxContextTokens: null,
    maxOutputTokens: null,
  };
}

function makeDefaults(overrides: Partial<{
  llmModelPlan: string;
  llmModelReasoning: string;
  llmPlanFallbackModel: string;
  llmReasoningFallbackModel: string;
}> = {}) {
  return {
    llmModelPlan: '',
    llmModelReasoning: '',
    llmPlanFallbackModel: '',
    llmReasoningFallbackModel: '',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  detectMixIssues                                                    */
/* ------------------------------------------------------------------ */

describe('detectMixIssues', () => {
  it('empty registry and no models produces only fallback-related info issues', () => {
    const issues = detectMixIssues([], makeDefaults());
    const keys = issues.map((i) => i.key);
    deepStrictEqual(keys, ['no-base-fallback', 'no-reasoning-fallback']);
    for (const issue of issues) {
      strictEqual(issue.severity, 'info');
    }
  });

  it('cross-provider base vs reasoning emits warning', () => {
    const registry = [
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
    ];
    const defaults = makeDefaults({
      llmModelPlan: 'gpt-4o',
      llmModelReasoning: 'claude-sonnet',
    });
    const issues = detectMixIssues(registry, defaults);
    const cross = issues.find((i) => i.key === 'cross-provider-base-reasoning');
    strictEqual(cross !== undefined, true);
    strictEqual(cross!.severity, 'warning');
    deepStrictEqual(cross!.ringFields, ['llmModelPlan', 'llmModelReasoning']);
  });

  it('fallback same as base model emits error', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o')],
      }),
    ];
    const defaults = makeDefaults({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: 'gpt-4o',
    });
    const issues = detectMixIssues(registry, defaults);
    const fb = issues.find((i) => i.key === 'fallback-same-as-base');
    strictEqual(fb !== undefined, true);
    strictEqual(fb!.severity, 'error');
    deepStrictEqual(fb!.ringFields, ['llmPlanFallbackModel']);
  });

  it('reasoning fallback same as reasoning model emits error', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'Anthropic',
        type: 'anthropic',
        models: [makeModel('claude-sonnet', 'reasoning')],
      }),
    ];
    const defaults = makeDefaults({
      llmModelReasoning: 'claude-sonnet',
      llmReasoningFallbackModel: 'claude-sonnet',
    });
    const issues = detectMixIssues(registry, defaults);
    const fb = issues.find((i) => i.key === 'reasoning-fallback-same-as-reasoning');
    strictEqual(fb !== undefined, true);
    strictEqual(fb!.severity, 'error');
    deepStrictEqual(fb!.ringFields, ['llmReasoningFallbackModel']);
  });

  it('same-provider fallback emits warning', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o'), makeModel('gpt-4o-mini')],
      }),
    ];
    const defaults = makeDefaults({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: 'gpt-4o-mini',
    });
    const issues = detectMixIssues(registry, defaults);
    const sp = issues.find((i) => i.key === 'same-provider-fallback');
    strictEqual(sp !== undefined, true);
    strictEqual(sp!.severity, 'warning');
    deepStrictEqual(sp!.ringFields, ['llmModelPlan', 'llmPlanFallbackModel']);
  });

  it('no base fallback configured emits info', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o')],
      }),
    ];
    const defaults = makeDefaults({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: '',
    });
    const issues = detectMixIssues(registry, defaults);
    const nfb = issues.find((i) => i.key === 'no-base-fallback');
    strictEqual(nfb !== undefined, true);
    strictEqual(nfb!.severity, 'info');
  });

  it('no reasoning fallback configured emits info', () => {
    const defaults = makeDefaults({
      llmModelReasoning: 'claude-sonnet',
      llmReasoningFallbackModel: '',
    });
    const issues = detectMixIssues([], defaults);
    const nfb = issues.find((i) => i.key === 'no-reasoning-fallback');
    strictEqual(nfb !== undefined, true);
    strictEqual(nfb!.severity, 'info');
  });

  it('local + remote mix in fallback chain emits warning', () => {
    const registry = [
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
    ];
    const defaults = makeDefaults({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: 'llama3',
    });
    const issues = detectMixIssues(registry, defaults);
    const mix = issues.find((i) => i.key === 'local-remote-mix');
    strictEqual(mix !== undefined, true);
    strictEqual(mix!.severity, 'warning');
    deepStrictEqual(mix!.ringFields, ['llmModelPlan', 'llmPlanFallbackModel']);
  });

  it('different API formats emits info', () => {
    const registry = [
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
    ];
    const defaults = makeDefaults({
      llmModelPlan: 'gpt-4o',
      llmModelReasoning: 'claude-sonnet',
    });
    const issues = detectMixIssues(registry, defaults);
    const apiFmt = issues.find((i) => i.key === 'different-api-formats');
    strictEqual(apiFmt !== undefined, true);
    strictEqual(apiFmt!.severity, 'info');
    deepStrictEqual(apiFmt!.ringFields, ['llmModelPlan', 'llmModelReasoning']);
  });

  it('same provider and same type for base and reasoning emits no cross-provider or api-format issues', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        type: 'openai-compatible',
        models: [makeModel('gpt-4o'), makeModel('gpt-4o-mini')],
      }),
    ];
    const defaults = makeDefaults({
      llmModelPlan: 'gpt-4o',
      llmModelReasoning: 'gpt-4o-mini',
    });
    const issues = detectMixIssues(registry, defaults);
    strictEqual(issues.find((i) => i.key === 'cross-provider-base-reasoning'), undefined);
    strictEqual(issues.find((i) => i.key === 'different-api-formats'), undefined);
  });

  it('disabled providers are invisible to resolution', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        enabled: false,
        models: [makeModel('gpt-4o')],
      }),
    ];
    const defaults = makeDefaults({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: '',
    });
    const issues = detectMixIssues(registry, defaults);
    // No cross-provider since base provider can't be resolved
    strictEqual(issues.find((i) => i.key === 'cross-provider-base-reasoning'), undefined);
  });

});

/* ------------------------------------------------------------------ */
/*  resolveRingColor                                                   */
/* ------------------------------------------------------------------ */

describe('resolveRingColor', () => {
  const errorIssue: MixIssue = {
    key: 'fallback-same-as-base',
    severity: 'error',
    title: 'Fallback matches base',
    message: 'test',
    ringFields: ['llmPlanFallbackModel'],
  };

  const warningIssue: MixIssue = {
    key: 'cross-provider-base-reasoning',
    severity: 'warning',
    title: 'Cross-provider',
    message: 'test',
    ringFields: ['llmModelPlan', 'llmModelReasoning'],
  };

  const infoIssue: MixIssue = {
    key: 'no-base-fallback',
    severity: 'info',
    title: 'No fallback',
    message: 'test',
    ringFields: ['llmPlanFallbackModel'],
  };

  it('error severity trumps warning and info', () => {
    const color = resolveRingColor(
      'llmPlanFallbackModel',
      [infoIssue, errorIssue, warningIssue],
      {},
    );
    strictEqual(color, 'var(--sf-error, #dc2626)');
  });

  it('warning severity trumps info when no error present', () => {
    const color = resolveRingColor(
      'llmModelPlan',
      [infoIssue, warningIssue],
      {},
    );
    strictEqual(color, 'var(--sf-warning, #d97706)');
  });

  it('info severity returns info color when alone', () => {
    const color = resolveRingColor(
      'llmPlanFallbackModel',
      [infoIssue],
      {},
    );
    strictEqual(color, 'var(--sf-info, #2563eb)');
  });

  it('dismissed keys are excluded from ring color resolution', () => {
    const color = resolveRingColor(
      'llmPlanFallbackModel',
      [errorIssue, infoIssue],
      { 'fallback-same-as-base': true, 'no-base-fallback': true },
    );
    strictEqual(color, null);
  });

  it('partial dismissal still shows remaining issues', () => {
    const color = resolveRingColor(
      'llmPlanFallbackModel',
      [errorIssue, infoIssue],
      { 'fallback-same-as-base': true },
    );
    strictEqual(color, 'var(--sf-info, #2563eb)');
  });

  it('returns null when no issues match the field', () => {
    const color = resolveRingColor(
      'llmModelReasoning',
      [errorIssue, infoIssue],
      {},
    );
    strictEqual(color, null);
  });

  it('returns null for empty issues array', () => {
    const color = resolveRingColor('llmModelPlan', [], {});
    strictEqual(color, null);
  });
});

/* ------------------------------------------------------------------ */
/*  detectStaleModelIssues                                              */
/* ------------------------------------------------------------------ */

describe('detectStaleModelIssues', () => {
  it('returns no issues when all models are in registry', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o')],
      }),
    ];
    const issues = detectStaleModelIssues(registry, { llmModelPlan: 'gpt-4o' });
    strictEqual(issues.length, 0);
  });

  it('returns warning when model is not in any enabled provider', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        models: [makeModel('gpt-4o')],
      }),
    ];
    const issues = detectStaleModelIssues(registry, { llmModelPlan: 'deleted-model' });
    strictEqual(issues.length, 1);
    strictEqual(issues[0].severity, 'warning');
    strictEqual(issues[0].ringFields.includes('llmModelPlan'), true);
  });

  it('skips empty model fields', () => {
    const issues = detectStaleModelIssues([], { llmModelPlan: '' });
    strictEqual(issues.length, 0);
  });

  it('does not warn if model is in knownModelOptions even if not in registry', () => {
    const issues = detectStaleModelIssues(
      [],
      { llmModelPlan: 'gpt-4o' },
      ['gpt-4o', 'claude-sonnet'],
    );
    strictEqual(issues.length, 0);
  });

  it('warns when model is not in registry AND not in knownModelOptions', () => {
    const issues = detectStaleModelIssues(
      [],
      { llmModelPlan: 'deleted-model' },
      ['gpt-4o', 'claude-sonnet'],
    );
    strictEqual(issues.length, 1);
    strictEqual(issues[0].key, 'stale-model-llmModelPlan');
  });

  it('detects stale model in disabled provider', () => {
    const registry = [
      makeProvider({
        id: 'p1',
        name: 'OpenAI',
        enabled: false,
        models: [makeModel('gpt-4o')],
      }),
    ];
    const issues = detectStaleModelIssues(registry, { llmModelPlan: 'gpt-4o' });
    strictEqual(issues.length, 1);
    strictEqual(issues[0].severity, 'warning');
  });

  it('detects multiple stale models', () => {
    const issues = detectStaleModelIssues([], {
      llmModelPlan: 'gone-a',
      llmModelReasoning: 'gone-b',
    });
    strictEqual(issues.length, 2);
  });
});
