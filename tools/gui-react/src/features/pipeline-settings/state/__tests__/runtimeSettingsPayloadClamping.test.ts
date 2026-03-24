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
    llmPlanApiKey: '',
    llmModelPlan: 'gpt-4o',
    llmModelReasoning: 'claude-sonnet',
    llmReasoningBudget: 0,
    llmMonthlyBudgetUsd: 100,
    llmPerProductBudgetUsd: 5,
    llmMaxCallsPerRound: 10,
    llmMaxOutputTokens: 4096,
    llmMaxTokens: 128000,
    llmTimeoutMs: 30000,
    llmCostInputPer1M: 2.5,
    llmCostOutputPer1M: 10,
    llmCostCachedInputPer1M: 1.25,
    llmPlanFallbackModel: 'gpt-4o-mini',
    llmReasoningFallbackModel: 'claude-haiku',
    outputMode: 'local',
    localInputRoot: '',
    localOutputRoot: '',
    runtimeEventsKey: '',
    s3InputPrefix: '',
    s3OutputPrefix: '',
    llmProvider: 'openai',
    llmBaseUrl: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    llmPlanProvider: '',
    llmPlanBaseUrl: '',
    resumeMode: 'off',
    perHostMinDelayMs: 500,
    searxngMinQueryIntervalMs: 1000,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensReasoning: 4096,
    llmMaxOutputTokensPlanFallback: 4096,
    llmMaxOutputTokensReasoningFallback: 4096,
    llmMaxCallsPerProductTotal: 100,
    resumeWindowHours: 24,
    crawleeRequestHandlerTimeoutSecs: 60,
    pageGotoTimeoutMs: 30000,
    pageNetworkIdleTimeoutMs: 5000,
    postLoadWaitMs: 1000,
    frontierDbPath: '',
    frontierQueryCooldownSeconds: 60,
    frontierCooldown404Seconds: 3600,
    frontierCooldown404RepeatSeconds: 86400,
    frontierCooldown410Seconds: 604800,
    frontierCooldownTimeoutSeconds: 300,
    frontierCooldown403BaseSeconds: 3600,
    frontierCooldown429BaseSeconds: 60,
    frontierBackoffMaxExponent: 5,
    frontierPathPenaltyNotfoundThreshold: 3,
    frontierBlockedDomainThreshold: 5,
    autoScrollPasses: 0,
    autoScrollDelayMs: 500,
    robotsTxtTimeoutMs: 5000,
    searchProfileQueryCap: 10,
    maxPagesPerDomain: 10,
    maxRunSeconds: 600,
    capturePageScreenshotQuality: 80,
    capturePageScreenshotMaxBytes: 524288,
    runtimeScreencastFps: 1,
    runtimeScreencastQuality: 50,
    runtimeScreencastMaxWidth: 1280,
    runtimeScreencastMaxHeight: 720,
    runtimeTraceFetchRing: 100,
    runtimeTraceLlmRing: 50,
    indexingResumeSeedLimit: 100,
    indexingResumePersistLimit: 1000,
    searchProfileCapMapJson: '',
    capturePageScreenshotFormat: 'jpeg',
    capturePageScreenshotSelectors: '',
    runtimeControlFile: '',
    specDbDir: '',
    categoryAuthorityRoot: '',
    discoveryEnabled: true,
    capturePageScreenshotEnabled: false,
    categoryAuthorityEnabled: false,
    crawleeHeadless: true,
    llmReasoningMode: false,
    llmPlanUseReasoning: false,
    localMode: true,
    dryRun: false,
    mirrorToS3: false,
    mirrorToS3Input: false,
    writeMarkdownSummary: false,
    frontierStripTrackingParams: true,
    autoScrollEnabled: false,
    robotsTxtCompliant: true,
    runtimeScreencastEnabled: false,
    runtimeTraceEnabled: false,
    runtimeTraceLlmPayloads: false,
    eventsJsonWrite: true,
    runtimeSettingsFallbackBaseline: makeBaselineZeros() as never,
    resolveModelTokenDefaults,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Fix 1: Fallback token clamping uses correct (fallback) model        */
/* ------------------------------------------------------------------ */

describe('collectRuntimeSettingsPayload — fallback token clamping', () => {
  it('clamps plan fallback tokens against fallback model, not primary', () => {
    // gpt-4o max=16384, gpt-4o-mini max=8192
    // Setting 12000 tokens: should be clamped to 8192 by fallback model limit
    const result = collectRuntimeSettingsPayload(makeInput({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: 'gpt-4o-mini',
      llmMaxOutputTokensPlanFallback: 12000,
    }));
    strictEqual(result.llmMaxOutputTokensPlanFallback, 8192);
  });

  it('clamps reasoning fallback tokens against fallback model, not primary', () => {
    // claude-sonnet max=16384, claude-haiku max=4096
    const result = collectRuntimeSettingsPayload(makeInput({
      llmModelReasoning: 'claude-sonnet',
      llmReasoningFallbackModel: 'claude-haiku',
      llmMaxOutputTokensReasoningFallback: 10000,
    }));
    strictEqual(result.llmMaxOutputTokensReasoningFallback, 4096);
  });

  it('falls back to primary model when no fallback model is configured', () => {
    // If no fallback model set, clamping should use primary model limits
    const result = collectRuntimeSettingsPayload(makeInput({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: '',
      llmMaxOutputTokensPlanFallback: 12000,
    }));
    // Should clamp to gpt-4o max (16384), so 12000 passes through
    strictEqual(result.llmMaxOutputTokensPlanFallback, 12000);
  });
});

