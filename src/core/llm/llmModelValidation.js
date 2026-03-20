// WHY: Validates that model IDs in a flat-key payload exist in the provider registry.
// Empty strings are allowed (fallbacks can be unset).
// Returns an array of { key, value } for each invalid model.

import { LLM_POLICY_GROUPS } from './llmPolicySchema.js';

const MODEL_FLAT_KEYS = Object.values(LLM_POLICY_GROUPS.models);

export function validateModelKeysAgainstRegistry(flatKeys, registryLookup) {
  if (!registryLookup || !registryLookup.modelIndex) return [];

  const rejected = [];
  for (const flatKey of MODEL_FLAT_KEYS) {
    const value = flatKeys[flatKey];
    if (value === undefined || value === null || value === '') continue;

    const modelId = String(value).trim();
    if (!modelId) continue;

    const hasComposite = modelId.indexOf(':') > 0
      ? registryLookup.compositeIndex.has(modelId)
      : registryLookup.modelIndex.has(modelId);

    if (!hasComposite) {
      rejected.push({ key: flatKey, value: modelId });
    }
  }

  return rejected;
}
