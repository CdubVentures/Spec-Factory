import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';

const DEFAULT_PREFIX = 'default-';
const LAB_PREFIX = 'lab-';

export function isDefaultProvider(providerId: string): boolean {
  return providerId.startsWith(DEFAULT_PREFIX) || providerId.startsWith(LAB_PREFIX);
}

export function isDefaultModel(modelId: string): boolean {
  return modelId.startsWith(DEFAULT_PREFIX);
}

/**
 * Merges default providers into a user's saved registry.
 * - Default providers always present, in canonical default order
 * - If user has a saved version of a default, preserve it entirely (user edits to costs/roles/tokens persist)
 * - If user is missing a default, insert the canonical default
 * - User-added providers appear after defaults, unmodified
 */
export function mergeDefaultsIntoRegistry(
  userRegistry: LlmProviderEntry[],
  defaultRegistry: LlmProviderEntry[],
): LlmProviderEntry[] {
  const userById = new Map<string, LlmProviderEntry>();
  for (const entry of userRegistry) {
    userById.set(entry.id, entry);
  }

  // Defaults first, in canonical order — user's full version if present, otherwise canonical default
  const merged: LlmProviderEntry[] = defaultRegistry.map((def) => {
    const userVersion = userById.get(def.id);
    return userVersion ?? def;
  });

  // Append user-added (non-default) providers
  for (const entry of userRegistry) {
    if (!isDefaultProvider(entry.id)) {
      merged.push(entry);
    }
  }

  return merged;
}
