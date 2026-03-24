import type { QueryClient } from '@tanstack/react-query';

import { RUNTIME_SETTING_DEFAULTS } from '../../../stores/settingsManifest.ts';
import type { RuntimeSettingDefaults } from '../../../stores/runtimeSettingsManifestTypes.ts';

type RuntimeSettingValue = string | number | boolean;

/**
 * WHY: Preserves 220+ keyed fields from registry SSOT for autocomplete + compile-time
 * validation, while allowing dynamic string-keyed access for API transport / Object.entries.
 * Partial because server snapshots may not contain every key.
 */
export type RuntimeSettings =
  Partial<{ [K in keyof RuntimeSettingDefaults]: RuntimeSettingValue }>
  & Record<string, RuntimeSettingValue>;

export interface RuntimeEditorSaveStatus {
  kind: 'idle' | 'ok' | 'partial' | 'error';
  message: string;
}

export const RUNTIME_SETTINGS_QUERY_KEY = ['runtime-settings'] as const;

type RuntimeSettingsDefaultsMap = typeof RUNTIME_SETTING_DEFAULTS;

type RuntimeSettingsNumericDefaultsMap = {
  [K in keyof RuntimeSettingsDefaultsMap as RuntimeSettingsDefaultsMap[K] extends number ? K : never]: RuntimeSettingsDefaultsMap[K];
};

function pickRuntimeNumericDefaults(
  source: RuntimeSettingsDefaultsMap,
): RuntimeSettingsNumericDefaultsMap {
  const defaults: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      defaults[key] = value;
    }
  }
  return defaults as RuntimeSettingsNumericDefaultsMap;
}

type RuntimeSettingsNumericBaselineKey = keyof RuntimeSettingsNumericDefaultsMap;
type RuntimeSettingsNumericSource = Partial<Record<RuntimeSettingsNumericBaselineKey, unknown>>;

export type RuntimeSettingsNumericBaseline = Record<RuntimeSettingsNumericBaselineKey, number>;

export const RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS = Object.freeze(
  pickRuntimeNumericDefaults(RUNTIME_SETTING_DEFAULTS),
);

const RUNTIME_SETTINGS_NUMERIC_BASELINE_KEYS = Object.freeze(
  Object.keys(RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS) as RuntimeSettingsNumericBaselineKey[],
);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readNumericSetting(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readRuntimeSettingsNumericBaseline(
  source: RuntimeSettingsNumericSource | undefined,
  fallback: RuntimeSettingsNumericBaseline = RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
): RuntimeSettingsNumericBaseline {
  const baseline = {} as RuntimeSettingsNumericBaseline;
  for (const key of RUNTIME_SETTINGS_NUMERIC_BASELINE_KEYS) {
    baseline[key] = readNumericSetting(source?.[key], fallback[key]);
  }
  return baseline;
}

export function runtimeSettingsNumericBaselineEqual(
  a: RuntimeSettingsNumericBaseline,
  b: RuntimeSettingsNumericBaseline,
) {
  return RUNTIME_SETTINGS_NUMERIC_BASELINE_KEYS.every((key) => a[key] === b[key]);
}

export function readRuntimeSettingsSnapshot(queryClient: QueryClient): RuntimeSettings | undefined {
  const cached = queryClient.getQueryData<unknown>(RUNTIME_SETTINGS_QUERY_KEY);
  if (!isObject(cached)) return undefined;
  const settings: RuntimeSettings = {};
  for (const [key, value] of Object.entries(cached)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      settings[key] = value;
    }
  }
  return settings;
}

export function readRuntimeSettingsBootstrap<T extends object>(
  queryClient: QueryClient,
  defaults: T,
): T {
  const snapshot = readRuntimeSettingsSnapshot(queryClient);
  return {
    ...defaults,
    ...(snapshot || {}),
  } as T;
}
