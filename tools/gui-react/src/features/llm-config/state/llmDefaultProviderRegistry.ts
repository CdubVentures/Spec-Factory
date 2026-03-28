import type { LlmProviderEntry, LlmProviderModel } from '../types/llmProviderRegistryTypes.ts';

const DEFAULT_PREFIX = 'default-';
const LAB_PREFIX = 'lab-';

export function isDefaultProvider(providerId: string): boolean {
  return providerId.startsWith(DEFAULT_PREFIX) || providerId.startsWith(LAB_PREFIX);
}

export function isDefaultModel(modelId: string): boolean {
  return modelId.startsWith(DEFAULT_PREFIX);
}

// WHY: Capability fields (thinking, webSearch) are determined by the Lab proxy,
// not user preference. Backfill them from canonical defaults onto user-saved
// models that predate these fields, without overwriting explicit user values.
const CAPABILITY_FIELDS: (keyof LlmProviderModel)[] = ['thinking', 'webSearch', 'thinkingEffortOptions'];

function backfillCapabilities(
  userModels: LlmProviderModel[],
  defaultModels: LlmProviderModel[],
): LlmProviderModel[] {
  const defaultById = new Map<string, LlmProviderModel>();
  for (const m of defaultModels) defaultById.set(m.id, m);

  return userModels.map((userModel) => {
    const def = defaultById.get(userModel.id);
    if (!def) return userModel;
    let patched: LlmProviderModel | null = null;
    for (const field of CAPABILITY_FIELDS) {
      if (userModel[field] === undefined && def[field] !== undefined) {
        patched ??= { ...userModel };
        patched = { ...patched, [field]: def[field] };
      }
    }
    return patched ?? userModel;
  });
}

/**
 * Merges default providers into a user's saved registry.
 * - Default providers always present, in canonical default order
 * - If user has a saved version of a default, preserve it entirely (user edits to costs/roles/tokens persist)
 * - Capability fields (thinking, webSearch) backfilled from defaults when missing on user models
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

  const merged: LlmProviderEntry[] = defaultRegistry.map((def) => {
    const userVersion = userById.get(def.id);
    if (!userVersion) return def;
    // WHY: Backfill capability fields from canonical defaults onto user models
    const patchedModels = backfillCapabilities(userVersion.models, def.models);
    return patchedModels === userVersion.models ? userVersion : { ...userVersion, models: patchedModels };
  });

  for (const entry of userRegistry) {
    if (!isDefaultProvider(entry.id)) {
      merged.push(entry);
    }
  }

  return merged;
}
