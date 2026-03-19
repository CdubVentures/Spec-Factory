// WHY: Adapter that bridges the composite LlmPolicy store to the flat-key
// interface that child sections (LlmGlobalSection, LlmExtractionSection) expect.
// This is the Strangler Fig boundary — children see flat keys, authority holds composite.

import type { LlmPolicy, LlmPolicyGroup } from '../types/llmPolicyTypes';

// WHY: Canonical mapping from flat RuntimeDraft key → (group, field) in LlmPolicy.
// This is the frontend mirror of LLM_POLICY_GROUPS in llmPolicySchema.js.
const FLAT_TO_GROUP: Record<string, { group: LlmPolicyGroup; field: string }> = {
  llmModelPlan:                      { group: 'models',     field: 'plan' },
  llmModelReasoning:                 { group: 'models',     field: 'reasoning' },
  llmPlanFallbackModel:              { group: 'models',     field: 'planFallback' },
  llmReasoningFallbackModel:         { group: 'models',     field: 'reasoningFallback' },
  llmProvider:                       { group: 'provider',   field: 'id' },
  llmBaseUrl:                        { group: 'provider',   field: 'baseUrl' },
  llmPlanProvider:                   { group: 'provider',   field: 'planProvider' },
  llmPlanBaseUrl:                    { group: 'provider',   field: 'planBaseUrl' },
  geminiApiKey:                      { group: 'apiKeys',    field: 'gemini' },
  deepseekApiKey:                    { group: 'apiKeys',    field: 'deepseek' },
  anthropicApiKey:                   { group: 'apiKeys',    field: 'anthropic' },
  openaiApiKey:                      { group: 'apiKeys',    field: 'openai' },
  llmPlanApiKey:                     { group: 'apiKeys',    field: 'plan' },
  llmMaxOutputTokens:                { group: 'tokens',     field: 'maxOutput' },
  llmMaxTokens:                      { group: 'tokens',     field: 'maxTokens' },
  llmMaxOutputTokensPlan:            { group: 'tokens',     field: 'plan' },
  llmMaxOutputTokensReasoning:       { group: 'tokens',     field: 'reasoning' },
  llmMaxOutputTokensPlanFallback:    { group: 'tokens',     field: 'planFallback' },
  llmMaxOutputTokensReasoningFallback: { group: 'tokens',   field: 'reasoningFallback' },
  llmPlanUseReasoning:               { group: 'reasoning',  field: 'enabled' },
  llmReasoningBudget:                { group: 'reasoning',  field: 'budget' },
  llmReasoningMode:                  { group: 'reasoning',  field: 'mode' },
  llmExtractionCacheDir:             { group: 'extraction', field: 'cacheDir' },
  llmExtractionCacheTtlMs:           { group: 'extraction', field: 'cacheTtlMs' },
  llmExtractMaxSnippetChars:         { group: 'extraction', field: 'maxSnippetChars' },
  llmExtractMaxSnippetsPerBatch:     { group: 'extraction', field: 'maxSnippetsPerBatch' },
  llmExtractSkipLowSignal:           { group: 'extraction', field: 'skipLowSignal' },
  llmMaxBatchesPerProduct:           { group: 'extraction', field: 'maxBatchesPerProduct' },
  llmMaxCallsPerProductTotal:        { group: 'extraction', field: 'maxCallsPerProductTotal' },
  llmMaxCallsPerRound:               { group: 'extraction', field: 'maxCallsPerRound' },
  llmMaxEvidenceChars:               { group: 'extraction', field: 'maxEvidenceChars' },
  llmMonthlyBudgetUsd:               { group: 'budget',     field: 'monthlyUsd' },
  llmPerProductBudgetUsd:            { group: 'budget',     field: 'perProductUsd' },
  llmCostInputPer1M:                 { group: 'budget',     field: 'costInputPer1M' },
  llmCostOutputPer1M:                { group: 'budget',     field: 'costOutputPer1M' },
  llmCostCachedInputPer1M:           { group: 'budget',     field: 'costCachedInputPer1M' },
  llmVerifyMode:                     { group: 'verify',     field: 'mode' },
  llmVerifySampleRate:               { group: 'verify',     field: 'sampleRate' },
};

// WHY: Top-level scalar keys that don't belong to a nested group.
const FLAT_TOP_LEVEL: Record<string, keyof Pick<LlmPolicy, 'timeoutMs' | 'writeSummary'>> = {
  llmTimeoutMs: 'timeoutMs',
  llmWriteSummary: 'writeSummary',
};

/**
 * Flatten an LlmPolicy into a flat key-value object matching RuntimeDraft shape.
 * Children can read `flat.llmModelPlan` instead of `policy.models.plan`.
 */
export function flattenLlmPolicy(policy: LlmPolicy): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [flatKey, { group, field }] of Object.entries(FLAT_TO_GROUP)) {
    const groupObj = policy[group] as unknown as Record<string, unknown>;
    flat[flatKey] = groupObj?.[field] ?? '';
  }
  for (const [flatKey, policyKey] of Object.entries(FLAT_TOP_LEVEL)) {
    flat[flatKey] = policy[policyKey];
  }
  // WHY: JSON-serialized fields for backward compat with children that read these.
  flat.llmPhaseOverridesJson = JSON.stringify(policy.phaseOverrides ?? {});
  flat.llmProviderRegistryJson = JSON.stringify(policy.providerRegistry ?? []);
  return flat;
}

// WHY: Reverse lookup — given a group name, return all flat keys that belong to it.
// Built once from FLAT_TO_GROUP for O(1) group lookup.
const GROUP_TO_FLAT: Record<string, Array<{ flatKey: string; field: string }>> = {};
for (const [flatKey, { group, field }] of Object.entries(FLAT_TO_GROUP)) {
  if (!GROUP_TO_FLAT[group]) GROUP_TO_FLAT[group] = [];
  GROUP_TO_FLAT[group].push({ flatKey, field });
}

/**
 * Flatten a single policy group's values into flat keys.
 * Used when a group is updated to push only the changed flat keys to the store.
 */
export function flattenPolicyGroup(
  group: LlmPolicyGroup,
  groupValues: Record<string, unknown>,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const mappings = GROUP_TO_FLAT[group];
  if (mappings) {
    for (const { flatKey, field } of mappings) {
      flat[flatKey] = groupValues?.[field] ?? '';
    }
  }
  return flat;
}

/**
 * Route a flat-key update to the correct LlmPolicy group.
 * Returns { group, patch } for use with updateGroup().
 * Returns null if the key is a top-level scalar or JSON field.
 */
export function routeFlatKeyUpdate(
  flatKey: string,
  value: unknown,
): { group: LlmPolicyGroup; patch: Record<string, unknown> } | { topLevel: Partial<LlmPolicy> } | null {
  const mapping = FLAT_TO_GROUP[flatKey];
  if (mapping) {
    return { group: mapping.group, patch: { [mapping.field]: value } };
  }
  const topLevelKey = FLAT_TOP_LEVEL[flatKey];
  if (topLevelKey) {
    return { topLevel: { [topLevelKey]: value } as Partial<LlmPolicy> };
  }
  return null;
}
