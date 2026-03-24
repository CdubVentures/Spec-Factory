// WHY: O(1) Feature Scaling — all LLM policy structure is derived from the registry's
// policyGroup/policyField metadata. Adding a new LLM setting = add one registry entry.
// assembleLlmPolicy converts flat config keys → structured policy.
// disassembleLlmPolicy converts structured policy → flat config keys.
// The round-trip invariant: disassemble(assemble(flat)) === flat for all LLM keys.

import { RUNTIME_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import {
  deriveLlmPolicyGroupMap,
  deriveLlmPolicyTopLevelKeys,
  deriveLlmPolicyJsonKeys,
  deriveLlmPolicyFlatKeyToEnv,
  deriveLlmPolicyDefaults,
} from '../../shared/settingsRegistryDerivations.js';

// WHY: Derived from policyGroup/policyField metadata in settingsRegistry.js.
export const LLM_POLICY_GROUPS = deriveLlmPolicyGroupMap(RUNTIME_SETTINGS_REGISTRY);
export const TOP_LEVEL_KEYS = deriveLlmPolicyTopLevelKeys(RUNTIME_SETTINGS_REGISTRY);
export const JSON_KEYS = deriveLlmPolicyJsonKeys(RUNTIME_SETTINGS_REGISTRY);
export const LLM_FLAT_KEY_TO_ENV = deriveLlmPolicyFlatKeyToEnv(RUNTIME_SETTINGS_REGISTRY);

// WHY: Complete list of all flat keys managed by LlmPolicy, for round-trip verification.
export const LLM_POLICY_FLAT_KEYS = Object.freeze([
  ...Object.values(LLM_POLICY_GROUPS).flatMap((group) => Object.values(group)),
  ...Object.values(TOP_LEVEL_KEYS),
  ...Object.values(JSON_KEYS),
]);

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
    budget: assembleGroup(source, LLM_POLICY_GROUPS.budget, readNumber),
    timeoutMs: readNumber(source, TOP_LEVEL_KEYS.timeoutMs),
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
    ...disassembleGroup(policy, 'budget', LLM_POLICY_GROUPS.budget),
    [TOP_LEVEL_KEYS.timeoutMs]: policy.timeoutMs ?? 0,
    [JSON_KEYS.phaseOverrides]: JSON.stringify(policy.phaseOverrides ?? {}),
    [JSON_KEYS.providerRegistry]: JSON.stringify(policy.providerRegistry ?? []),
  };
}

/**
 * Default LlmPolicy assembled from registry defaults.
 * WHY: Derived from policyGroup entries — no hand-maintained default values.
 */
export const DEFAULT_LLM_POLICY = Object.freeze(
  assembleLlmPolicy(deriveLlmPolicyDefaults(RUNTIME_SETTINGS_REGISTRY))
);
