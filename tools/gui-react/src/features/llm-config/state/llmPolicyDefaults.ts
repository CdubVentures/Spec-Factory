// WHY: Frontend default LlmPolicy assembled from the same registry defaults
// that the backend uses. This provides the bootstrap policy for useLlmPolicyAuthority
// before the server hydration completes.

import { RUNTIME_SETTING_DEFAULTS } from '../../../stores/settingsManifest';
import type { LlmPolicy } from '../types/llmPolicyTypes';
import { flattenLlmPolicy } from './llmPolicyAdapter';

function readStr(source: Record<string, unknown>, key: string): string {
  return String(source[key] ?? '');
}

function readNum(source: Record<string, unknown>, key: string): number {
  const raw = source[key];
  if (raw === undefined || raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readBool(source: Record<string, unknown>, key: string): boolean {
  return Boolean(source[key] ?? false);
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

/**
 * Assemble an LlmPolicy from a flat settings object (e.g., RUNTIME_SETTING_DEFAULTS).
 * Frontend mirror of assembleLlmPolicy in src/core/llm/llmPolicySchema.js.
 */
export function assembleLlmPolicyFromFlat(source: Record<string, unknown>): LlmPolicy {
  return {
    models: {
      plan: readStr(source, 'llmModelPlan'),
      reasoning: readStr(source, 'llmModelReasoning'),
      planFallback: readStr(source, 'llmPlanFallbackModel'),
      reasoningFallback: readStr(source, 'llmReasoningFallbackModel'),
    },
    provider: {
      id: readStr(source, 'llmProvider'),
      baseUrl: readStr(source, 'llmBaseUrl'),
      planProvider: readStr(source, 'llmPlanProvider'),
      planBaseUrl: readStr(source, 'llmPlanBaseUrl'),
    },
    apiKeys: {
      gemini: readStr(source, 'geminiApiKey'),
      deepseek: readStr(source, 'deepseekApiKey'),
      anthropic: readStr(source, 'anthropicApiKey'),
      openai: readStr(source, 'openaiApiKey'),
      plan: readStr(source, 'llmPlanApiKey'),
    },
    tokens: {
      maxOutput: readNum(source, 'llmMaxOutputTokens'),
      maxTokens: readNum(source, 'llmMaxTokens'),
      plan: readNum(source, 'llmMaxOutputTokensPlan'),
      reasoning: readNum(source, 'llmMaxOutputTokensReasoning'),
      planFallback: readNum(source, 'llmMaxOutputTokensPlanFallback'),
      reasoningFallback: readNum(source, 'llmMaxOutputTokensReasoningFallback'),
    },
    reasoning: {
      enabled: readBool(source, 'llmPlanUseReasoning'),
      budget: readNum(source, 'llmReasoningBudget'),
      mode: readBool(source, 'llmReasoningMode'),
    },
    phaseOverrides: safeJsonParse(source.llmPhaseOverridesJson, {}),
    providerRegistry: safeJsonParse(source.llmProviderRegistryJson, []),
    extraction: {
      cacheDir: readStr(source, 'llmExtractionCacheDir'),
      cacheTtlMs: readNum(source, 'llmExtractionCacheTtlMs'),
      maxSnippetChars: readNum(source, 'llmExtractMaxSnippetChars'),
      maxSnippetsPerBatch: readNum(source, 'llmExtractMaxSnippetsPerBatch'),
      skipLowSignal: readBool(source, 'llmExtractSkipLowSignal'),
      maxBatchesPerProduct: readNum(source, 'llmMaxBatchesPerProduct'),
      maxCallsPerProductTotal: readNum(source, 'llmMaxCallsPerProductTotal'),
      maxCallsPerRound: readNum(source, 'llmMaxCallsPerRound'),
      maxEvidenceChars: readNum(source, 'llmMaxEvidenceChars'),
    },
    budget: {
      monthlyUsd: readNum(source, 'llmMonthlyBudgetUsd'),
      perProductUsd: readNum(source, 'llmPerProductBudgetUsd'),
      costInputPer1M: readNum(source, 'llmCostInputPer1M'),
      costOutputPer1M: readNum(source, 'llmCostOutputPer1M'),
      costCachedInputPer1M: readNum(source, 'llmCostCachedInputPer1M'),
    },
    verify: {
      mode: readBool(source, 'llmVerifyMode'),
      sampleRate: readNum(source, 'llmVerifySampleRate'),
    },
    timeoutMs: readNum(source, 'llmTimeoutMs'),
    writeSummary: readBool(source, 'llmWriteSummary'),
  };
}

export const DEFAULT_LLM_POLICY: LlmPolicy = assembleLlmPolicyFromFlat(
  RUNTIME_SETTING_DEFAULTS as unknown as Record<string, unknown>,
);
