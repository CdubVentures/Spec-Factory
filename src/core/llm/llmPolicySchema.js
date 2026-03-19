// WHY: Single source of truth for the LlmPolicy composite shape.
// assembleLlmPolicy converts flat config keys → structured policy.
// disassembleLlmPolicy converts structured policy → flat config keys.
// The round-trip invariant: disassemble(assemble(flat)) === flat for all LLM keys.

// WHY: Canonical mapping from composite group.field → flat config key.
// Adding a new LLM setting = add one entry here + one registry entry.
export const LLM_POLICY_GROUPS = Object.freeze({
  models: Object.freeze({
    plan: 'llmModelPlan',
    reasoning: 'llmModelReasoning',
    planFallback: 'llmPlanFallbackModel',
    reasoningFallback: 'llmReasoningFallbackModel',
  }),
  provider: Object.freeze({
    id: 'llmProvider',
    baseUrl: 'llmBaseUrl',
    planProvider: 'llmPlanProvider',
    planBaseUrl: 'llmPlanBaseUrl',
  }),
  apiKeys: Object.freeze({
    gemini: 'geminiApiKey',
    deepseek: 'deepseekApiKey',
    anthropic: 'anthropicApiKey',
    openai: 'openaiApiKey',
    plan: 'llmPlanApiKey',
  }),
  tokens: Object.freeze({
    maxOutput: 'llmMaxOutputTokens',
    maxTokens: 'llmMaxTokens',
    plan: 'llmMaxOutputTokensPlan',
    reasoning: 'llmMaxOutputTokensReasoning',
    planFallback: 'llmMaxOutputTokensPlanFallback',
    reasoningFallback: 'llmMaxOutputTokensReasoningFallback',
  }),
  reasoning: Object.freeze({
    enabled: 'llmPlanUseReasoning',
    budget: 'llmReasoningBudget',
    mode: 'llmReasoningMode',
  }),
  extraction: Object.freeze({
    cacheDir: 'llmExtractionCacheDir',
    cacheTtlMs: 'llmExtractionCacheTtlMs',
    maxSnippetChars: 'llmExtractMaxSnippetChars',
    maxSnippetsPerBatch: 'llmExtractMaxSnippetsPerBatch',
    skipLowSignal: 'llmExtractSkipLowSignal',
    maxBatchesPerProduct: 'llmMaxBatchesPerProduct',
    maxCallsPerProductTotal: 'llmMaxCallsPerProductTotal',
    maxCallsPerRound: 'llmMaxCallsPerRound',
    maxEvidenceChars: 'llmMaxEvidenceChars',
  }),
  budget: Object.freeze({
    monthlyUsd: 'llmMonthlyBudgetUsd',
    perProductUsd: 'llmPerProductBudgetUsd',
    costInputPer1M: 'llmCostInputPer1M',
    costOutputPer1M: 'llmCostOutputPer1M',
    costCachedInputPer1M: 'llmCostCachedInputPer1M',
  }),
  verify: Object.freeze({
    mode: 'llmVerifyMode',
    sampleRate: 'llmVerifySampleRate',
  }),
});

// WHY: Top-level scalar keys that don't belong to a nested group.
const TOP_LEVEL_KEYS = Object.freeze({
  timeoutMs: 'llmTimeoutMs',
  writeSummary: 'llmWriteSummary',
});

// WHY: JSON-serialized fields that become parsed objects in the composite.
const JSON_KEYS = Object.freeze({
  phaseOverrides: 'llmPhaseOverridesJson',
  providerRegistry: 'llmProviderRegistryJson',
});

// WHY: Complete list of all flat keys managed by LlmPolicy, for round-trip verification.
export const LLM_POLICY_FLAT_KEYS = Object.freeze([
  ...Object.values(LLM_POLICY_GROUPS).flatMap((group) => Object.values(group)),
  ...Object.values(TOP_LEVEL_KEYS),
  ...Object.values(JSON_KEYS),
]);

// WHY: Flat config key → env var name mapping for processStartLaunchPlan.
// Only includes keys that have corresponding env vars (empty envKey = not env-settable).
export const LLM_FLAT_KEY_TO_ENV = Object.freeze({
  llmModelPlan: 'LLM_MODEL_PLAN',
  llmModelReasoning: 'LLM_MODEL_REASONING',
  llmPlanFallbackModel: 'LLM_PLAN_FALLBACK_MODEL',
  llmReasoningFallbackModel: 'LLM_REASONING_FALLBACK_MODEL',
  llmProvider: 'LLM_PROVIDER',
  llmBaseUrl: 'LLM_BASE_URL',
  llmPlanProvider: 'LLM_PLAN_PROVIDER',
  llmPlanBaseUrl: 'LLM_PLAN_BASE_URL',
  geminiApiKey: 'GEMINI_API_KEY',
  deepseekApiKey: 'DEEPSEEK_API_KEY',
  anthropicApiKey: 'ANTHROPIC_API_KEY',
  openaiApiKey: 'OPENAI_API_KEY',
  llmPlanApiKey: 'LLM_PLAN_API_KEY',
  llmMaxOutputTokens: 'LLM_MAX_OUTPUT_TOKENS',
  llmMaxTokens: 'LLM_MAX_TOKENS',
  llmMaxOutputTokensPlan: 'LLM_MAX_OUTPUT_TOKENS_PLAN',
  llmMaxOutputTokensReasoning: 'LLM_MAX_OUTPUT_TOKENS_REASONING',
  llmMaxOutputTokensPlanFallback: 'LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK',
  llmMaxOutputTokensReasoningFallback: 'LLM_MAX_OUTPUT_TOKENS_REASONING_FALLBACK',
  llmPlanUseReasoning: 'LLM_PLAN_USE_REASONING',
  llmReasoningBudget: 'LLM_REASONING_BUDGET',
  llmReasoningMode: 'LLM_REASONING_MODE',
  llmExtractionCacheDir: 'LLM_EXTRACTION_CACHE_DIR',
  llmExtractionCacheTtlMs: 'LLM_EXTRACTION_CACHE_TTL_MS',
  llmExtractMaxSnippetChars: 'LLM_EXTRACT_MAX_SNIPPET_CHARS',
  llmExtractMaxSnippetsPerBatch: 'LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH',
  llmExtractSkipLowSignal: 'LLM_EXTRACT_SKIP_LOW_SIGNAL',
  llmMaxBatchesPerProduct: 'LLM_MAX_BATCHES_PER_PRODUCT',
  llmMaxCallsPerProductTotal: 'LLM_MAX_CALLS_PER_PRODUCT_TOTAL',
  llmMaxCallsPerRound: 'LLM_MAX_CALLS_PER_ROUND',
  llmMaxEvidenceChars: 'LLM_MAX_EVIDENCE_CHARS',
  llmMonthlyBudgetUsd: 'LLM_MONTHLY_BUDGET_USD',
  llmPerProductBudgetUsd: 'LLM_PER_PRODUCT_BUDGET_USD',
  llmCostInputPer1M: 'LLM_COST_INPUT_PER_1M',
  llmCostOutputPer1M: 'LLM_COST_OUTPUT_PER_1M',
  llmCostCachedInputPer1M: 'LLM_COST_CACHED_INPUT_PER_1M',
  llmVerifyMode: 'LLM_VERIFY_MODE',
  llmVerifySampleRate: 'LLM_VERIFY_SAMPLE_RATE',
  llmTimeoutMs: 'LLM_TIMEOUT_MS',
  llmWriteSummary: 'LLM_WRITE_SUMMARY',
  // JSON blobs have no env var equivalent (they're persisted-only)
});

function safeJsonParse(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function readString(source, key) {
  return String(source?.[key] ?? '');
}

function readNumber(source, key) {
  const raw = source?.[key];
  if (raw === undefined || raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readBool(source, key) {
  return Boolean(source?.[key] ?? false);
}

function assembleGroup(source, groupMap, reader) {
  const result = {};
  for (const [field, flatKey] of Object.entries(groupMap)) {
    result[field] = reader(source, flatKey);
  }
  return result;
}

/**
 * Convert flat config keys → structured LlmPolicy.
 * Safe for partial input — missing keys produce type-appropriate defaults.
 */
export function assembleLlmPolicy(source = {}) {
  return {
    models: assembleGroup(source, LLM_POLICY_GROUPS.models, readString),
    provider: assembleGroup(source, LLM_POLICY_GROUPS.provider, readString),
    apiKeys: assembleGroup(source, LLM_POLICY_GROUPS.apiKeys, readString),
    tokens: assembleGroup(source, LLM_POLICY_GROUPS.tokens, readNumber),
    reasoning: assembleGroup(source, LLM_POLICY_GROUPS.reasoning, (src, key) => {
      if (key === 'llmReasoningBudget') return readNumber(src, key);
      return readBool(src, key);
    }),
    phaseOverrides: safeJsonParse(source[JSON_KEYS.phaseOverrides], {}),
    providerRegistry: safeJsonParse(source[JSON_KEYS.providerRegistry], []),
    extraction: assembleGroup(source, LLM_POLICY_GROUPS.extraction, (src, key) => {
      if (key === 'llmExtractionCacheDir') return readString(src, key);
      if (key === 'llmExtractSkipLowSignal') return readBool(src, key);
      return readNumber(src, key);
    }),
    budget: assembleGroup(source, LLM_POLICY_GROUPS.budget, readNumber),
    verify: assembleGroup(source, LLM_POLICY_GROUPS.verify, (src, key) => {
      if (key === 'llmVerifySampleRate') return readNumber(src, key);
      return readBool(src, key);
    }),
    timeoutMs: readNumber(source, TOP_LEVEL_KEYS.timeoutMs),
    writeSummary: readBool(source, TOP_LEVEL_KEYS.writeSummary),
  };
}

function disassembleGroup(policy, groupName, groupMap) {
  const result = {};
  const group = policy?.[groupName] || {};
  for (const [field, flatKey] of Object.entries(groupMap)) {
    result[flatKey] = group[field] ?? '';
  }
  return result;
}

/**
 * Convert structured LlmPolicy → flat config keys.
 * Produces a plain object with exactly the keys in LLM_POLICY_FLAT_KEYS.
 */
export function disassembleLlmPolicy(policy = {}) {
  return {
    ...disassembleGroup(policy, 'models', LLM_POLICY_GROUPS.models),
    ...disassembleGroup(policy, 'provider', LLM_POLICY_GROUPS.provider),
    ...disassembleGroup(policy, 'apiKeys', LLM_POLICY_GROUPS.apiKeys),
    ...disassembleGroup(policy, 'tokens', LLM_POLICY_GROUPS.tokens),
    ...disassembleGroup(policy, 'reasoning', LLM_POLICY_GROUPS.reasoning),
    ...disassembleGroup(policy, 'extraction', LLM_POLICY_GROUPS.extraction),
    ...disassembleGroup(policy, 'budget', LLM_POLICY_GROUPS.budget),
    ...disassembleGroup(policy, 'verify', LLM_POLICY_GROUPS.verify),
    [TOP_LEVEL_KEYS.timeoutMs]: policy.timeoutMs ?? 0,
    [TOP_LEVEL_KEYS.writeSummary]: policy.writeSummary ?? false,
    [JSON_KEYS.phaseOverrides]: JSON.stringify(policy.phaseOverrides ?? {}),
    [JSON_KEYS.providerRegistry]: JSON.stringify(policy.providerRegistry ?? []),
  };
}

/**
 * Default LlmPolicy assembled from registry defaults.
 */
export const DEFAULT_LLM_POLICY = Object.freeze(assembleLlmPolicy({
  llmModelPlan: 'gemini-2.5-flash',
  llmModelReasoning: 'deepseek-reasoner',
  llmPlanFallbackModel: 'deepseek-chat',
  llmReasoningFallbackModel: 'gemini-2.5-pro',
  llmProvider: 'gemini',
  llmBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  llmPlanProvider: 'gemini',
  llmPlanBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  llmMaxOutputTokens: 1400,
  llmMaxTokens: 16384,
  llmMaxOutputTokensPlan: 4096,
  llmMaxOutputTokensReasoning: 4096,
  llmMaxOutputTokensPlanFallback: 2048,
  llmMaxOutputTokensReasoningFallback: 2048,
  llmPlanUseReasoning: false,
  llmReasoningBudget: 32768,
  llmReasoningMode: true,
  llmPhaseOverridesJson: '{}',
  llmProviderRegistryJson: '[]',
  llmExtractionCacheDir: '.specfactory_tmp/llm_cache',
  llmExtractionCacheTtlMs: 604800000,
  llmExtractMaxSnippetChars: 700,
  llmExtractMaxSnippetsPerBatch: 4,
  llmExtractSkipLowSignal: true,
  llmMaxBatchesPerProduct: 4,
  llmMaxCallsPerProductTotal: 14,
  llmMaxCallsPerRound: 5,
  llmMaxEvidenceChars: 60000,
  llmMonthlyBudgetUsd: 300,
  llmPerProductBudgetUsd: 0.35,
  llmCostInputPer1M: 1.25,
  llmCostOutputPer1M: 10,
  llmCostCachedInputPer1M: 0.125,
  llmVerifyMode: true,
  llmVerifySampleRate: 25,
  llmTimeoutMs: 30000,
  llmWriteSummary: false,
}));
