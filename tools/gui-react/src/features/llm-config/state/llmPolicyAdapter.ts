// WHY: Adapter that bridges the composite LlmPolicy store to the flat-key
// interface that child sections (LlmGlobalSection) expect.
// This is the Strangler Fig boundary — children see flat keys, authority holds composite.
// Maps are auto-generated from backend LLM_POLICY_GROUPS SSOT.

import type { LlmPolicy, LlmPolicyGroup } from './llmPolicyAdapter.generated.ts';
import { FLAT_TO_GROUP, FLAT_TOP_LEVEL } from './llmPolicyAdapter.generated.ts';

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
    flat[flatKey] = policy[policyKey as keyof LlmPolicy];
  }
  // WHY: JSON-serialized fields for backward compat with children that read these.
  flat.llmPhaseOverridesJson = JSON.stringify(policy.phaseOverrides ?? {});
  flat.llmProviderRegistryJson = JSON.stringify(policy.providerRegistry ?? []);
  flat.keyFinderTierSettingsJson = JSON.stringify(
    (policy as unknown as { keyFinderTiers?: unknown }).keyFinderTiers ?? {},
  );
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
  // WHY: JSON-blob flat keys parse back into structured top-level policy fields.
  if (flatKey === 'keyFinderTierSettingsJson') {
    try {
      const parsed = JSON.parse(String(value));
      return { topLevel: { keyFinderTiers: parsed } as unknown as Partial<LlmPolicy> };
    } catch {
      return null;
    }
  }
  return null;
}
