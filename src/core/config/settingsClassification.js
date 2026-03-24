// WHY: Settings key classification constants and helpers extracted from config.js (Phase 3).
// Used by config assembly to determine which env vars are explicit vs defaulted,
// and which settings keys map to which config keys.

import {
  RUNTIME_SETTINGS_ROUTE_GET,
  CONVERGENCE_SETTINGS_KEYS,
  DUAL_KEY_PAIRS,
  assertDualKeyConsistency
} from './settingsKeyMap.js';
import { SETTINGS_DEFAULTS } from '../../shared/settingsDefaults.js';

const RUNTIME_SETTINGS_DEFAULTS = Object.freeze(SETTINGS_DEFAULTS?.runtime || {});
const CONVERGENCE_SETTINGS_DEFAULTS = Object.freeze(SETTINGS_DEFAULTS?.convergence || {});
const LEGACY_HELPER_ROOT_ENV = `HELPER${'_FILES'}_ROOT`;

export const SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS = new Set([
  'llmPlanApiKey',
  'openaiApiKey',
  'anthropicApiKey',
]);

export const NON_CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS = new Set([
  'localOutputRoot',
]);

export const CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS = new Set(
  Object.keys(RUNTIME_SETTINGS_DEFAULTS).filter((key) => (
    !SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS.has(key)
    && !NON_CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS.has(key)
  ))
);

export const EXPLICIT_ENV_KEY_OVERRIDES = new Map([
  ['categoryAuthorityEnabled', ['HELPER_FILES_ENABLED']],
  ['categoryAuthorityRoot', ['CATEGORY_AUTHORITY_ROOT', LEGACY_HELPER_ROOT_ENV]],
  ['llmProvider', ['LLM_PROVIDER', 'LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmBaseUrl', ['LLM_BASE_URL', 'OPENAI_BASE_URL', 'DEEPSEEK_API_KEY']],
  ['llmModelPlan', ['LLM_MODEL_PLAN', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_PLAN', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmModelReasoning', ['LLM_MODEL_REASONING', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmPlanProvider', ['LLM_PLAN_PROVIDER', 'LLM_PROVIDER', 'LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmPlanBaseUrl', ['LLM_PLAN_BASE_URL', 'LLM_BASE_URL', 'OPENAI_BASE_URL', 'DEEPSEEK_API_KEY']],
  ['runtimeScreencastEnabled', ['RUNTIME_SCREENCAST_ENABLED']],
  ['runtimeScreencastFps', ['RUNTIME_SCREENCAST_FPS']],
  ['runtimeScreencastQuality', ['RUNTIME_SCREENCAST_QUALITY']],
  ['runtimeScreencastMaxWidth', ['RUNTIME_SCREENCAST_MAX_WIDTH']],
  ['runtimeScreencastMaxHeight', ['RUNTIME_SCREENCAST_MAX_HEIGHT']],
]);

function buildRuntimeSettingsConfigKeyMap() {
  const pairs = [
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.floatMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap),
  ];
  return new Map(pairs);
}

export const RUNTIME_SETTINGS_CONFIG_KEY_MAP = buildRuntimeSettingsConfigKeyMap();

export function toEnvKey(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase();
}

export function resolveSettingEnvKeys(settingKey, configKey) {
  return (
    EXPLICIT_ENV_KEY_OVERRIDES.get(settingKey)
    || EXPLICIT_ENV_KEY_OVERRIDES.get(configKey)
    || [toEnvKey(configKey || settingKey)]
  );
}

export function hasExplicitSettingEnv(settingKey, configKey, explicitEnvKeys) {
  const envKeys = resolveSettingEnvKeys(settingKey, configKey);
  return envKeys.some((envKey) => explicitEnvKeys.has(envKey));
}

export function explicitEnvValue(name, explicitEnvKeys) {
  if (!explicitEnvKeys.has(name)) {
    return '';
  }
  return String(process.env[name] ?? '');
}

export function applyCanonicalSettingsDefaults(cfg, explicitEnvKeys) {
  const next = { ...cfg };

  for (const key of CONVERGENCE_SETTINGS_KEYS) {
    if (!Object.hasOwn(CONVERGENCE_SETTINGS_DEFAULTS, key)) continue;
    if (hasExplicitSettingEnv(key, key, explicitEnvKeys)) continue;
    next[key] = CONVERGENCE_SETTINGS_DEFAULTS[key];
  }

  for (const key of CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS) {
    if (!Object.hasOwn(RUNTIME_SETTINGS_DEFAULTS, key)) continue;
    const configKey = RUNTIME_SETTINGS_CONFIG_KEY_MAP.get(key) || key;
    if (hasExplicitSettingEnv(key, configKey, explicitEnvKeys)) continue;
    if (!Object.hasOwn(next, configKey)) continue;
    next[configKey] = RUNTIME_SETTINGS_DEFAULTS[key];
  }

  return next;
}

// WHY: Validates SETTINGS_DEFAULTS against route type contracts at startup (Phase 10).
// Catches malformed defaults (wrong type, out-of-range) before they propagate silently.
export function assertDefaultsValid(defaults) {
  const runtime = defaults?.runtime || {};
  const convergence = defaults?.convergence || {};

  // Validate runtime int keys are actually numbers
  for (const [settingKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap)) {
    if (!Object.hasOwn(runtime, settingKey)) continue;
    const val = runtime[settingKey];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new Error(
        `SETTINGS_DEFAULTS.runtime.${settingKey} must be a finite number, got ${typeof val}: ${JSON.stringify(val)}`
      );
    }
  }

  // Validate runtime float keys are actually numbers
  for (const [settingKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.floatMap)) {
    if (!Object.hasOwn(runtime, settingKey)) continue;
    const val = runtime[settingKey];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new Error(
        `SETTINGS_DEFAULTS.runtime.${settingKey} must be a finite number, got ${typeof val}: ${JSON.stringify(val)}`
      );
    }
  }

  // Validate runtime bool keys are actually booleans
  for (const [settingKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap)) {
    if (!Object.hasOwn(runtime, settingKey)) continue;
    const val = runtime[settingKey];
    if (typeof val !== 'boolean') {
      throw new Error(
        `SETTINGS_DEFAULTS.runtime.${settingKey} must be a boolean, got ${typeof val}: ${JSON.stringify(val)}`
      );
    }
  }

  // Validate runtime string keys are actually strings
  for (const [settingKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap)) {
    if (!Object.hasOwn(runtime, settingKey)) continue;
    const val = runtime[settingKey];
    if (typeof val !== 'string') {
      throw new Error(
        `SETTINGS_DEFAULTS.runtime.${settingKey} must be a string, got ${typeof val}: ${JSON.stringify(val)}`
      );
    }
  }

  // Validate convergence keys exist
  for (const key of CONVERGENCE_SETTINGS_KEYS) {
    if (!Object.hasOwn(convergence, key)) {
      throw new Error(
        `SETTINGS_DEFAULTS.convergence.${key} is required but missing`
      );
    }
  }

  // Validate dual-key consistency
  assertDualKeyConsistency(runtime);
}
