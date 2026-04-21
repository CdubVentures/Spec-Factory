// AUTO-GENERATED from registry policyGroup/policyField metadata — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPolicyAdapter.js

import type { LlmPhaseOverride } from '../types/llmPhaseOverrideTypes.generated';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';

export interface LlmPolicyApiKeys {
  anthropic: string;
  deepseek: string;
  gemini: string;
  openai: string;
}

export interface LlmPolicyProvider {
  baseUrl: string;
  id: string;
}

export interface LlmPolicyBudget {
  costCachedInputPer1M: number;
  costInputPer1M: number;
  costOutputPer1M: number;
}

export interface LlmPolicyTokens {
  maxOutput: number;
  plan: number;
  triage: number;
  reasoning: number;
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

export type LlmPolicyGroup = 'apiKeys' | 'provider' | 'budget' | 'tokens' | 'models' | 'reasoning';

export interface LlmPolicy {
  apiKeys: LlmPolicyApiKeys;
  provider: LlmPolicyProvider;
  budget: LlmPolicyBudget;
  tokens: LlmPolicyTokens;
  models: LlmPolicyModels;
  reasoning: LlmPolicyReasoning;
  phaseOverrides: Record<string, Partial<LlmPhaseOverride>>;
  providerRegistry: LlmProviderEntry[];
  keyFinderTiers: Record<string, number>;
  labQueueDelayMs: number;
  timeoutMs: number;
}

export const FLAT_TO_GROUP: Record<string, { group: LlmPolicyGroup; field: string }> = {
  anthropicApiKey:                           { group: 'apiKeys', field: 'anthropic' },
  deepseekApiKey:                            { group: 'apiKeys', field: 'deepseek' },
  geminiApiKey:                              { group: 'apiKeys', field: 'gemini' },
  openaiApiKey:                              { group: 'apiKeys', field: 'openai' },
  llmBaseUrl:                                { group: 'provider', field: 'baseUrl' },
  llmProvider:                               { group: 'provider', field: 'id' },
  llmCostCachedInputPer1M:                   { group: 'budget', field: 'costCachedInputPer1M' },
  llmCostInputPer1M:                         { group: 'budget', field: 'costInputPer1M' },
  llmCostOutputPer1M:                        { group: 'budget', field: 'costOutputPer1M' },
  llmMaxOutputTokens:                        { group: 'tokens', field: 'maxOutput' },
  llmMaxOutputTokensPlan:                    { group: 'tokens', field: 'plan' },
  llmMaxOutputTokensTriage:                  { group: 'tokens', field: 'triage' },
  llmMaxOutputTokensReasoning:               { group: 'tokens', field: 'reasoning' },
  llmMaxTokens:                              { group: 'tokens', field: 'maxTokens' },
  llmModelPlan:                              { group: 'models', field: 'plan' },
  llmModelReasoning:                         { group: 'models', field: 'reasoning' },
  llmPlanFallbackModel:                      { group: 'models', field: 'planFallback' },
  llmReasoningFallbackModel:                 { group: 'models', field: 'reasoningFallback' },
  llmPlanUseReasoning:                       { group: 'reasoning', field: 'enabled' },
  llmReasoningBudget:                        { group: 'reasoning', field: 'budget' },
  llmReasoningMode:                          { group: 'reasoning', field: 'mode' },
};

export const FLAT_TOP_LEVEL: Record<string, string> = {
  llmLabQueueDelayMs: 'labQueueDelayMs',
  llmTimeoutMs: 'timeoutMs',
};

export const LLM_POLICY_MANAGED_KEYS = [
  'anthropicApiKey',
  'deepseekApiKey',
  'geminiApiKey',
  'openaiApiKey',
  'llmBaseUrl',
  'llmProvider',
  'llmCostCachedInputPer1M',
  'llmCostInputPer1M',
  'llmCostOutputPer1M',
  'llmMaxOutputTokens',
  'llmMaxOutputTokensPlan',
  'llmMaxOutputTokensTriage',
  'llmMaxOutputTokensReasoning',
  'llmMaxTokens',
  'llmModelPlan',
  'llmModelReasoning',
  'llmPlanFallbackModel',
  'llmReasoningFallbackModel',
  'llmPlanUseReasoning',
  'llmReasoningBudget',
  'llmReasoningMode',
  'llmLabQueueDelayMs',
  'llmTimeoutMs',
  'llmPhaseOverridesJson',
  'llmProviderRegistryJson',
  'keyFinderTierSettingsJson',
] as const;

// --- Reader utilities (inlined for zero-dependency assembly) ---

function readStr(source: Record<string, unknown>, key: string, fallback = ''): string {
  return String(source[key] ?? fallback);
}

function readNum(source: Record<string, unknown>, key: string, fallback = 0): number {
  const raw = source[key];
  if (raw === undefined || raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(source: Record<string, unknown>, key: string, fallback = false): boolean {
  const raw = source[key];
  if (raw === undefined || raw === null) return fallback;
  return Boolean(raw);
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

export function assembleLlmPolicyFromFlat(source: Record<string, unknown>): LlmPolicy {
  return {
    apiKeys: {
      anthropic: readStr(source, 'anthropicApiKey', ""),
      deepseek: readStr(source, 'deepseekApiKey', ""),
      gemini: readStr(source, 'geminiApiKey', ""),
      openai: readStr(source, 'openaiApiKey', ""),
    },
    provider: {
      baseUrl: readStr(source, 'llmBaseUrl', "https://generativelanguage.googleapis.com/v1beta/openai"),
      id: readStr(source, 'llmProvider', "gemini"),
    },
    budget: {
      costCachedInputPer1M: readNum(source, 'llmCostCachedInputPer1M', 0.125),
      costInputPer1M: readNum(source, 'llmCostInputPer1M', 1.25),
      costOutputPer1M: readNum(source, 'llmCostOutputPer1M', 10),
    },
    tokens: {
      maxOutput: readNum(source, 'llmMaxOutputTokens', 1400),
      plan: readNum(source, 'llmMaxOutputTokensPlan', 4096),
      triage: readNum(source, 'llmMaxOutputTokensTriage', 20000),
      reasoning: readNum(source, 'llmMaxOutputTokensReasoning', 4096),
      maxTokens: readNum(source, 'llmMaxTokens', 16384),
    },
    models: {
      plan: readStr(source, 'llmModelPlan', "gemini-2.5-flash"),
      reasoning: readStr(source, 'llmModelReasoning', "deepseek-reasoner"),
      planFallback: readStr(source, 'llmPlanFallbackModel', "deepseek-chat"),
      reasoningFallback: readStr(source, 'llmReasoningFallbackModel', "gemini-2.5-pro"),
    },
    reasoning: {
      enabled: readBool(source, 'llmPlanUseReasoning', false),
      budget: readNum(source, 'llmReasoningBudget', 32768),
      mode: readBool(source, 'llmReasoningMode', true),
    },
    phaseOverrides: safeJsonParse(source.llmPhaseOverridesJson, {}),
    providerRegistry: safeJsonParse(source.llmProviderRegistryJson, []),
    keyFinderTiers: safeJsonParse(source.keyFinderTierSettingsJson, {}),
    labQueueDelayMs: readNum(source, 'llmLabQueueDelayMs', 1000),
    timeoutMs: readNum(source, 'llmTimeoutMs', 30000),
  };
}
