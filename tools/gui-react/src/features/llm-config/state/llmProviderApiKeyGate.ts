import type { LlmProviderEntry, LlmProviderType } from '../types/llmProviderRegistryTypes.ts';

export interface RuntimeApiKeySlice {
  geminiApiKey: string;
  deepseekApiKey: string;
  anthropicApiKey: string;
  openaiApiKey: string;
}

const LOCAL_PROVIDER_TYPES: ReadonlySet<LlmProviderType> = new Set(['ollama']);

export const PROVIDER_API_KEY_MAP: Readonly<Record<string, keyof RuntimeApiKeySlice>> = {
  'default-gemini': 'geminiApiKey',
  'default-deepseek': 'deepseekApiKey',
  'default-anthropic': 'anthropicApiKey',
  'default-openai': 'openaiApiKey',
};

/**
 * Resolves the editable API-key value for a provider row.
 *
 * Precedence:
 *  1. The provider row's own apiKey when non-empty
 *  2. The mapped flat runtime key for built-in default providers
 *  3. The provider row's current value (including explicit empty string)
 *
 * WHY: The provider-registry editor must not backfill from unrelated server
 * snapshots while the user is editing. An explicit clear ("") must remain
 * blank instead of being immediately repopulated from stale external data.
 */
export function resolveEditableProviderApiKey(
  provider: LlmProviderEntry,
  runtimeKeys: RuntimeApiKeySlice,
): string {
  if (typeof provider.apiKey === 'string' && provider.apiKey.length > 0) {
    return provider.apiKey;
  }

  const runtimeKeyField = PROVIDER_API_KEY_MAP[provider.id];
  const runtimeValue = runtimeKeyField ? runtimeKeys[runtimeKeyField] : '';
  // TODO(SET-005): Remove after debugging — trace what backfills cleared keys
  if (runtimeKeyField && runtimeValue) {
    console.warn('[apikey-debug]', provider.id, { providerApiKey: provider.apiKey, runtimeKeyField, runtimeValue: runtimeValue.slice(0, 8) + '...' });
  }
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) {
    return runtimeValue;
  }

  return provider.apiKey ?? '';
}

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

  if (provider.accessMode === 'lab') return true;

  if (provider.apiKey.trim()) return true;

  const runtimeKeyField = PROVIDER_API_KEY_MAP[provider.id];
  if (runtimeKeyField && runtimeKeys[runtimeKeyField]?.trim()) return true;

  return false;
}
