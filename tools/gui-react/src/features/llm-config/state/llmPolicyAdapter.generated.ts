// AUTO-GENERATED from registry policyGroup/policyField metadata — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPolicyAdapter.js

import type { LlmPhaseOverride } from '../types/llmPhaseOverrideTypes';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';

export interface LlmPolicyApiKeys {
  anthropic: string;
  deepseek: string;
  gemini: string;
  plan: string;
  openai: string;
}

export interface LlmPolicyProvider {
  baseUrl: string;
  planBaseUrl: string;
  planProvider: string;
  id: string;
}

export interface LlmPolicyBudget {
  costCachedInputPer1M: number;
  costInputPer1M: number;
  costOutputPer1M: number;
  monthlyUsd: number;
  perProductUsd: number;
}

export interface LlmPolicyExtraction {
  maxSnippetChars: number;
  maxSnippetsPerBatch: number;
  skipLowSignal: boolean;
  cacheDir: string;
  cacheTtlMs: number;
  maxBatchesPerProduct: number;
  maxCallsPerProductTotal: number;
  maxCallsPerRound: number;
  maxEvidenceChars: number;
}

export interface LlmPolicyTokens {
  maxOutput: number;
  plan: number;
  planFallback: number;
  reasoning: number;
  reasoningFallback: number;
  maxTokens: number;
}

export interface LlmPolicyModels {
  plan: string;
  reasoning: string;
  planFallback: string;
  reasoningFallback: string;
}

export interface LlmPolicyReasoning {
  enabled: boolean;
  budget: number;
  mode: boolean;
}

export interface LlmPolicyVerify {
  mode: boolean;
  sampleRate: number;
}

export type LlmPolicyGroup = 'apiKeys' | 'provider' | 'budget' | 'extraction' | 'tokens' | 'models' | 'reasoning' | 'verify';

export interface LlmPolicy {
  apiKeys: LlmPolicyApiKeys;
  provider: LlmPolicyProvider;
  budget: LlmPolicyBudget;
  extraction: LlmPolicyExtraction;
  tokens: LlmPolicyTokens;
  models: LlmPolicyModels;
  reasoning: LlmPolicyReasoning;
  verify: LlmPolicyVerify;
  phaseOverrides: Record<string, Partial<LlmPhaseOverride>>;
  providerRegistry: LlmProviderEntry[];
  timeoutMs: number;
  writeSummary: boolean;
}

export const FLAT_TO_GROUP: Record<string, { group: LlmPolicyGroup; field: string }> = {
  anthropicApiKey:                           { group: 'apiKeys', field: 'anthropic' },
  deepseekApiKey:                            { group: 'apiKeys', field: 'deepseek' },
  geminiApiKey:                              { group: 'apiKeys', field: 'gemini' },
  llmPlanApiKey:                             { group: 'apiKeys', field: 'plan' },
  openaiApiKey:                              { group: 'apiKeys', field: 'openai' },
  llmBaseUrl:                                { group: 'provider', field: 'baseUrl' },
  llmPlanBaseUrl:                            { group: 'provider', field: 'planBaseUrl' },
  llmPlanProvider:                           { group: 'provider', field: 'planProvider' },
  llmProvider:                               { group: 'provider', field: 'id' },
  llmCostCachedInputPer1M:                   { group: 'budget', field: 'costCachedInputPer1M' },
  llmCostInputPer1M:                         { group: 'budget', field: 'costInputPer1M' },
  llmCostOutputPer1M:                        { group: 'budget', field: 'costOutputPer1M' },
  llmMonthlyBudgetUsd:                       { group: 'budget', field: 'monthlyUsd' },
  llmPerProductBudgetUsd:                    { group: 'budget', field: 'perProductUsd' },
  llmExtractMaxSnippetChars:                 { group: 'extraction', field: 'maxSnippetChars' },
  llmExtractMaxSnippetsPerBatch:             { group: 'extraction', field: 'maxSnippetsPerBatch' },
  llmExtractSkipLowSignal:                   { group: 'extraction', field: 'skipLowSignal' },
  llmExtractionCacheDir:                     { group: 'extraction', field: 'cacheDir' },
  llmExtractionCacheTtlMs:                   { group: 'extraction', field: 'cacheTtlMs' },
  llmMaxBatchesPerProduct:                   { group: 'extraction', field: 'maxBatchesPerProduct' },
  llmMaxCallsPerProductTotal:                { group: 'extraction', field: 'maxCallsPerProductTotal' },
  llmMaxCallsPerRound:                       { group: 'extraction', field: 'maxCallsPerRound' },
  llmMaxEvidenceChars:                       { group: 'extraction', field: 'maxEvidenceChars' },
  llmMaxOutputTokens:                        { group: 'tokens', field: 'maxOutput' },
  llmMaxOutputTokensPlan:                    { group: 'tokens', field: 'plan' },
  llmMaxOutputTokensPlanFallback:            { group: 'tokens', field: 'planFallback' },
  llmMaxOutputTokensReasoning:               { group: 'tokens', field: 'reasoning' },
  llmMaxOutputTokensReasoningFallback:       { group: 'tokens', field: 'reasoningFallback' },
  llmMaxTokens:                              { group: 'tokens', field: 'maxTokens' },
  llmModelPlan:                              { group: 'models', field: 'plan' },
  llmModelReasoning:                         { group: 'models', field: 'reasoning' },
  llmPlanFallbackModel:                      { group: 'models', field: 'planFallback' },
  llmReasoningFallbackModel:                 { group: 'models', field: 'reasoningFallback' },
  llmPlanUseReasoning:                       { group: 'reasoning', field: 'enabled' },
  llmReasoningBudget:                        { group: 'reasoning', field: 'budget' },
  llmReasoningMode:                          { group: 'reasoning', field: 'mode' },
  llmVerifyMode:                             { group: 'verify', field: 'mode' },
  llmVerifySampleRate:                       { group: 'verify', field: 'sampleRate' },
};

export const FLAT_TOP_LEVEL: Record<string, string> = {
  llmTimeoutMs: 'timeoutMs',
  llmWriteSummary: 'writeSummary',
};

export const LLM_POLICY_MANAGED_KEYS = [
  'anthropicApiKey',
  'deepseekApiKey',
  'geminiApiKey',
  'llmPlanApiKey',
  'openaiApiKey',
  'llmBaseUrl',
  'llmPlanBaseUrl',
  'llmPlanProvider',
  'llmProvider',
  'llmCostCachedInputPer1M',
  'llmCostInputPer1M',
  'llmCostOutputPer1M',
  'llmMonthlyBudgetUsd',
  'llmPerProductBudgetUsd',
  'llmExtractMaxSnippetChars',
  'llmExtractMaxSnippetsPerBatch',
  'llmExtractSkipLowSignal',
  'llmExtractionCacheDir',
  'llmExtractionCacheTtlMs',
  'llmMaxBatchesPerProduct',
  'llmMaxCallsPerProductTotal',
  'llmMaxCallsPerRound',
  'llmMaxEvidenceChars',
  'llmMaxOutputTokens',
  'llmMaxOutputTokensPlan',
  'llmMaxOutputTokensPlanFallback',
  'llmMaxOutputTokensReasoning',
  'llmMaxOutputTokensReasoningFallback',
  'llmMaxTokens',
  'llmModelPlan',
  'llmModelReasoning',
  'llmPlanFallbackModel',
  'llmReasoningFallbackModel',
  'llmPlanUseReasoning',
  'llmReasoningBudget',
  'llmReasoningMode',
  'llmVerifyMode',
  'llmVerifySampleRate',
  'llmTimeoutMs',
  'llmWriteSummary',
  'llmPhaseOverridesJson',
  'llmProviderRegistryJson',
] as const;

// --- Reader utilities (inlined for zero-dependency assembly) ---

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

export function assembleLlmPolicyFromFlat(source: Record<string, unknown>): LlmPolicy {
  return {
    apiKeys: {
      anthropic: readStr(source, 'anthropicApiKey'),
      deepseek: readStr(source, 'deepseekApiKey'),
      gemini: readStr(source, 'geminiApiKey'),
      plan: readStr(source, 'llmPlanApiKey'),
      openai: readStr(source, 'openaiApiKey'),
    },
    provider: {
      baseUrl: readStr(source, 'llmBaseUrl'),
      planBaseUrl: readStr(source, 'llmPlanBaseUrl'),
      planProvider: readStr(source, 'llmPlanProvider'),
      id: readStr(source, 'llmProvider'),
    },
    budget: {
      costCachedInputPer1M: readNum(source, 'llmCostCachedInputPer1M'),
      costInputPer1M: readNum(source, 'llmCostInputPer1M'),
      costOutputPer1M: readNum(source, 'llmCostOutputPer1M'),
      monthlyUsd: readNum(source, 'llmMonthlyBudgetUsd'),
      perProductUsd: readNum(source, 'llmPerProductBudgetUsd'),
    },
    extraction: {
      maxSnippetChars: readNum(source, 'llmExtractMaxSnippetChars'),
      maxSnippetsPerBatch: readNum(source, 'llmExtractMaxSnippetsPerBatch'),
      skipLowSignal: readBool(source, 'llmExtractSkipLowSignal'),
      cacheDir: readStr(source, 'llmExtractionCacheDir'),
      cacheTtlMs: readNum(source, 'llmExtractionCacheTtlMs'),
      maxBatchesPerProduct: readNum(source, 'llmMaxBatchesPerProduct'),
      maxCallsPerProductTotal: readNum(source, 'llmMaxCallsPerProductTotal'),
      maxCallsPerRound: readNum(source, 'llmMaxCallsPerRound'),
      maxEvidenceChars: readNum(source, 'llmMaxEvidenceChars'),
    },
    tokens: {
      maxOutput: readNum(source, 'llmMaxOutputTokens'),
      plan: readNum(source, 'llmMaxOutputTokensPlan'),
      planFallback: readNum(source, 'llmMaxOutputTokensPlanFallback'),
      reasoning: readNum(source, 'llmMaxOutputTokensReasoning'),
      reasoningFallback: readNum(source, 'llmMaxOutputTokensReasoningFallback'),
      maxTokens: readNum(source, 'llmMaxTokens'),
    },
    models: {
      plan: readStr(source, 'llmModelPlan'),
      reasoning: readStr(source, 'llmModelReasoning'),
      planFallback: readStr(source, 'llmPlanFallbackModel'),
      reasoningFallback: readStr(source, 'llmReasoningFallbackModel'),
    },
    reasoning: {
      enabled: readBool(source, 'llmPlanUseReasoning'),
      budget: readNum(source, 'llmReasoningBudget'),
      mode: readBool(source, 'llmReasoningMode'),
    },
    verify: {
      mode: readBool(source, 'llmVerifyMode'),
      sampleRate: readNum(source, 'llmVerifySampleRate'),
    },
    phaseOverrides: safeJsonParse(source.llmPhaseOverridesJson, {}),
    providerRegistry: safeJsonParse(source.llmProviderRegistryJson, []),
    timeoutMs: readNum(source, 'llmTimeoutMs'),
    writeSummary: readBool(source, 'llmWriteSummary'),
  };
}
