import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { collectRuntimeSettingsPayload } from '../runtimeSettingsPayload.ts';
import type { RuntimeSettingsPayloadSerializerInput } from '../runtimeSettingsDomainTypes.ts';
import type { RuntimeModelTokenDefaults } from '../runtimeSettingsDomainTypes.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const MODEL_LIMITS: Record<string, RuntimeModelTokenDefaults> = {
  'gpt-4o': { default_output_tokens: 4096, max_output_tokens: 16384 },
  'gpt-4o-mini': { default_output_tokens: 2048, max_output_tokens: 8192 },
  'claude-sonnet': { default_output_tokens: 4096, max_output_tokens: 16384 },
  'claude-haiku': { default_output_tokens: 2048, max_output_tokens: 4096 },
  'deepseek-r1': { default_output_tokens: 4096, max_output_tokens: 32768 },
  'deepseek-v3': { default_output_tokens: 2048, max_output_tokens: 8192 },
};

const FALLBACK_MODEL = { default_output_tokens: 4096, max_output_tokens: 16384 };

function resolveModelTokenDefaults(model: string): RuntimeModelTokenDefaults {
  return MODEL_LIMITS[model] ?? FALLBACK_MODEL;
}

function makeBaselineZeros(): Record<string, number> {
  return new Proxy({} as Record<string, number>, {
    get: () => 0,
  });
}

function makeInput(
  overrides: Partial<RuntimeSettingsPayloadSerializerInput> = {},
): RuntimeSettingsPayloadSerializerInput {
  return {
    searchEngines: 'bing,brave,duckduckgo',
    searxngBaseUrl: '',
    llmModelPlan: 'gpt-4o',
    llmModelReasoning: 'claude-sonnet',
    llmReasoningBudget: 0,
    llmMaxOutputTokens: 4096,
    llmMaxTokens: 128000,
    llmTimeoutMs: 30000,
    llmCostInputPer1M: 2.5,
    llmCostOutputPer1M: 10,
    llmCostCachedInputPer1M: 1.25,
    llmPlanFallbackModel: 'gpt-4o-mini',
    llmReasoningFallbackModel: 'claude-haiku',
    localInputRoot: '',
    localOutputRoot: '',
    runtimeEventsKey: '',
    llmProvider: 'openai',
    llmBaseUrl: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    searxngMinQueryIntervalMs: 1000,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensReasoning: 4096,
    crawleeRequestHandlerTimeoutSecs: 60,
    autoScrollPasses: 0,
    autoScrollDelayMs: 500,
    searchProfileQueryCap: 10,
    domainClassifierUrlCap: 10,
    maxRunSeconds: 600,
    capturePageScreenshotQuality: 80,
    capturePageScreenshotMaxBytes: 524288,
    searchProfileCapMapJson: '',
    capturePageScreenshotFormat: 'jpeg',
    capturePageScreenshotSelectors: '',
    runtimeControlFile: '',
    specDbDir: '',
    categoryAuthorityRoot: '',
    discoveryEnabled: true,
    capturePageScreenshotEnabled: false,
    crawleeHeadless: true,
    llmReasoningMode: false,
    llmPlanUseReasoning: false,
    dryRun: false,
    autoScrollEnabled: false,
    robotsTxtCompliant: true,
    runtimeScreencastEnabled: false,
    runtimeSettingsFallbackBaseline: makeBaselineZeros() as never,
    resolveModelTokenDefaults,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Retired fallback-token knobs: must not be serialized                */
/* ------------------------------------------------------------------ */

describe('collectRuntimeSettingsPayload — retired fallback tokens', () => {
  it('does not serialize llmMaxOutputTokensPlanFallback (retired — fallback inherits phase cap)', () => {
    const result = collectRuntimeSettingsPayload(makeInput({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: 'gpt-4o-mini',
    } as never));
    strictEqual(
      Object.prototype.hasOwnProperty.call(result, 'llmMaxOutputTokensPlanFallback'),
      false,
    );
    strictEqual(result.llmPlanFallbackModel, 'gpt-4o-mini');
  });

  it('does not serialize the retired reasoning fallback token knob', () => {
    const result = collectRuntimeSettingsPayload(makeInput({
      llmModelReasoning: 'claude-sonnet',
      llmReasoningFallbackModel: 'claude-haiku',
    } as never));
    strictEqual(
      Object.prototype.hasOwnProperty.call(result, 'llmMaxOutputTokensReasoningFallback'),
      false,
    );
    strictEqual(result.llmReasoningFallbackModel, 'claude-haiku');
  });
});

