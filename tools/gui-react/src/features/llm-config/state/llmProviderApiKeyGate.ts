import type { LlmProviderEntry, LlmProviderType } from '../types/llmProviderRegistryTypes';

export interface RuntimeApiKeySlice {
  geminiApiKey: string;
  deepseekApiKey: string;
  anthropicApiKey: string;
  openaiApiKey: string;
  llmPlanApiKey: string;
}

const LOCAL_PROVIDER_TYPES: ReadonlySet<LlmProviderType> = new Set(['ollama']);

/** WHY: Gemini uses llmPlanApiKey as legacy fallback — it was historically the only provider key field. */
export const PROVIDER_API_KEY_MAP: Readonly<Record<string, keyof RuntimeApiKeySlice>> = {
  'default-gemini': 'geminiApiKey',
  'default-deepseek': 'deepseekApiKey',
  'default-anthropic': 'anthropicApiKey',
  'default-openai': 'openaiApiKey',
};

/**
 * Extracts API keys from registry providers and maps them to standalone runtime key fields.
 * WHY: When resetting to defaults, registry-stored keys must be preserved via standalone fields.
 */
export function extractRegistryApiKeys(
  registry: LlmProviderEntry[],
): Partial<RuntimeApiKeySlice> {
  const result: Partial<RuntimeApiKeySlice> = {};
  for (const provider of registry) {
    if (!provider.apiKey?.trim()) continue;
    const field = PROVIDER_API_KEY_MAP[provider.id];
    if (field) result[field] = provider.apiKey;
  }
  return result;
}

/**
 * Resolves whether a provider has a usable API key from any source.
 *
 * Check order:
 *  1. Local providers (ollama) — always true, no key needed
 *  2. Registry-level apiKey on the provider entry
 *  3. Runtime key mapped from default provider ID (e.g. default-gemini → geminiApiKey)
 */
export function providerHasApiKey(
  provider: LlmProviderEntry,
  runtimeKeys: RuntimeApiKeySlice,
): boolean {
  if (LOCAL_PROVIDER_TYPES.has(provider.type)) return true;

  if (provider.apiKey.trim()) return true;

  const runtimeKeyField = PROVIDER_API_KEY_MAP[provider.id];
  if (runtimeKeyField && runtimeKeys[runtimeKeyField]?.trim()) return true;

  return false;
}
