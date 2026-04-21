// WHY: O(1) Feature Scaling — all LLM policy structure is derived from the registry's
// policyGroup/policyField metadata. Adding a new LLM setting = add one registry entry.
// assembleLlmPolicy converts flat config keys → structured policy.
// disassembleLlmPolicy converts structured policy → flat config keys.
// The round-trip invariant: disassemble(assemble(flat)) === flat for all LLM keys.

import { z } from 'zod';
import { RUNTIME_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import {
  deriveLlmPolicyGroupMap,
  deriveLlmPolicyTopLevelKeys,
  deriveLlmPolicyJsonKeys,
  deriveLlmPolicyFlatKeyToEnv,
  deriveLlmPolicyDefaults,
} from '../../shared/settingsRegistryDerivations.js';

// WHY: Zod enforces post-Phase-1 vocab at the trust boundary. Pre-Phase-1 tokens
// (identity/critical/required/expected/optional for required_level;
// expected/editorial_only for availability; instrumented for difficulty) are
// rejected by .strict() — schemas demand the exact post-migration key sets.
const POINT_INT = z.number().int().min(0);
const KEY_FINDER_BUDGET_REQUIRED = z.object({ mandatory: POINT_INT, non_mandatory: POINT_INT }).strict();
const KEY_FINDER_BUDGET_AVAILABILITY = z.object({ always: POINT_INT, sometimes: POINT_INT, rare: POINT_INT }).strict();
const KEY_FINDER_BUDGET_DIFFICULTY = z.object({ easy: POINT_INT, medium: POINT_INT, hard: POINT_INT, very_hard: POINT_INT }).strict();
const KEY_FINDER_TIER_TABLE = z.object({ easy: POINT_INT, medium: POINT_INT, hard: POINT_INT, very_hard: POINT_INT }).strict();

const KEY_FINDER_BUDGET_REQUIRED_DEFAULT = Object.freeze({ mandatory: 2, non_mandatory: 1 });
const KEY_FINDER_BUDGET_AVAILABILITY_DEFAULT = Object.freeze({ always: 1, sometimes: 2, rare: 3 });
const KEY_FINDER_BUDGET_DIFFICULTY_DEFAULT = Object.freeze({ easy: 1, medium: 2, hard: 3, very_hard: 4 });
const KEY_FINDER_BUNDLING_PASSENGER_COST_DEFAULT = Object.freeze({ easy: 1, medium: 2, hard: 4, very_hard: 8 });
const KEY_FINDER_BUNDLING_POOL_DEFAULT = Object.freeze({ easy: 6, medium: 4, hard: 2, very_hard: 1 });

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

function assembleKeyFinder(source) {
  const passengerPolicy = readString(source, 'keyFinderPassengerDifficultyPolicy');
  return {
    modelEasy: readString(source, 'keyFinderModelEasy'),
    modelMedium: readString(source, 'keyFinderModelMedium'),
    modelHard: readString(source, 'keyFinderModelHard'),
    modelVeryHard: readString(source, 'keyFinderModelVeryHard'),
    modelFallback: readString(source, 'keyFinderModelFallback'),
    budgetFloor: readNumber(source, 'keyFinderBudgetFloor'),
    variantPointsPerExtra: readNumber(source, 'keyFinderBudgetVariantPointsPerExtra'),
    bundlingEnabled: readBool(source, 'keyFinderBundlingEnabled'),
    passengerDifficultyPolicy: passengerPolicy || 'less_or_equal',
    budgetRequired: KEY_FINDER_BUDGET_REQUIRED.parse(
      safeJsonParse(source[JSON_KEYS.keyFinderBudgetRequired], { ...KEY_FINDER_BUDGET_REQUIRED_DEFAULT })
    ),
    budgetAvailability: KEY_FINDER_BUDGET_AVAILABILITY.parse(
      safeJsonParse(source[JSON_KEYS.keyFinderBudgetAvailability], { ...KEY_FINDER_BUDGET_AVAILABILITY_DEFAULT })
    ),
    budgetDifficulty: KEY_FINDER_BUDGET_DIFFICULTY.parse(
      safeJsonParse(source[JSON_KEYS.keyFinderBudgetDifficulty], { ...KEY_FINDER_BUDGET_DIFFICULTY_DEFAULT })
    ),
    bundlingPassengerCost: KEY_FINDER_TIER_TABLE.parse(
      safeJsonParse(source[JSON_KEYS.keyFinderBundlingPassengerCost], { ...KEY_FINDER_BUNDLING_PASSENGER_COST_DEFAULT })
    ),
    bundlingPoolPerPrimary: KEY_FINDER_TIER_TABLE.parse(
      safeJsonParse(source[JSON_KEYS.keyFinderBundlingPoolPerPrimary], { ...KEY_FINDER_BUNDLING_POOL_DEFAULT })
    ),
  };
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
    keyFinder: assembleKeyFinder(source),
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
  const kf = policy.keyFinder || {};
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
    keyFinderModelEasy: kf.modelEasy ?? '',
    keyFinderModelMedium: kf.modelMedium ?? '',
    keyFinderModelHard: kf.modelHard ?? '',
    keyFinderModelVeryHard: kf.modelVeryHard ?? '',
    keyFinderModelFallback: kf.modelFallback ?? '',
    keyFinderBudgetFloor: kf.budgetFloor ?? 3,
    keyFinderBudgetVariantPointsPerExtra: kf.variantPointsPerExtra ?? 1,
    keyFinderBundlingEnabled: kf.bundlingEnabled ?? false,
    keyFinderPassengerDifficultyPolicy: kf.passengerDifficultyPolicy ?? 'less_or_equal',
    [JSON_KEYS.keyFinderBudgetRequired]: JSON.stringify(kf.budgetRequired ?? { ...KEY_FINDER_BUDGET_REQUIRED_DEFAULT }),
    [JSON_KEYS.keyFinderBudgetAvailability]: JSON.stringify(kf.budgetAvailability ?? { ...KEY_FINDER_BUDGET_AVAILABILITY_DEFAULT }),
    [JSON_KEYS.keyFinderBudgetDifficulty]: JSON.stringify(kf.budgetDifficulty ?? { ...KEY_FINDER_BUDGET_DIFFICULTY_DEFAULT }),
    [JSON_KEYS.keyFinderBundlingPassengerCost]: JSON.stringify(kf.bundlingPassengerCost ?? { ...KEY_FINDER_BUNDLING_PASSENGER_COST_DEFAULT }),
    [JSON_KEYS.keyFinderBundlingPoolPerPrimary]: JSON.stringify(kf.bundlingPoolPerPrimary ?? { ...KEY_FINDER_BUNDLING_POOL_DEFAULT }),
  };
}

/**
 * Default LlmPolicy assembled from registry defaults.
 * WHY: Derived from policyGroup entries — no hand-maintained default values.
 */
export const DEFAULT_LLM_POLICY = Object.freeze(
  assembleLlmPolicy(deriveLlmPolicyDefaults(RUNTIME_SETTINGS_REGISTRY))
);
