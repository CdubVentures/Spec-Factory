// WHY: O(1) Feature Scaling — payload serializer is registry-driven. Adding a new
// setting to settingsRegistry.js auto-serializes it here. Zero per-field code.

import type { RuntimeSettings } from './runtimeSettingsAuthority.ts';
import type { RuntimeSettingsPayloadSerializerInput } from './runtimeSettingsDomainTypes.ts';
import {
  clampTokenForModel,
  parseRuntimeFloat,
  parseRuntimeInt,
} from './runtimeSettingsParsing.ts';
import {
  RUNTIME_SETTINGS_REGISTRY,
  type RegistryEntry,
} from '../../../shared/registryDerivedSettingsMaps.ts';

// WHY: Token-clamped entries need model-aware clamping. Derived from registry
// metadata (clampModelKey) — adding a new token-clamped setting requires only
// one registry entry with clampModelKey. Zero per-field code here.
const TOKEN_CLAMP_MODEL_MAP: Record<string, { modelKey: string; fallbackModelKey?: string }> =
  Object.fromEntries(
    RUNTIME_SETTINGS_REGISTRY
      .filter((e: RegistryEntry) => e.tokenClamped && e.clampModelKey)
      .map((e: RegistryEntry) => [e.key, {
        modelKey: e.clampModelKey!,
        ...(e.clampModelFallbackKey ? { fallbackModelKey: e.clampModelFallbackKey } : {}),
      }])
  );

function serializeEntry(
  input: Record<string, unknown>,
  baseline: Record<string, number>,
  entry: RegistryEntry,
  resolveModelTokenDefaults: RuntimeSettingsPayloadSerializerInput['resolveModelTokenDefaults'],
): string | number | boolean {
  const key = entry.key;
  const raw = Object.prototype.hasOwnProperty.call(input, key)
    ? input[key]
    : entry.default;

  // WHY: tokenClamped entries use model-aware clamping, not standard int parse.
  if (entry.tokenClamped) {
    const mapping = TOKEN_CLAMP_MODEL_MAP[key];
    if (mapping) {
      const model = String(input[mapping.modelKey] || (mapping.fallbackModelKey ? input[mapping.fallbackModelKey] : '') || '');
      return clampTokenForModel(model, raw as number | string, resolveModelTokenDefaults);
    }
  }

  switch (entry.type) {
    case 'int':
      return parseRuntimeInt(raw, baseline[key] ?? 0);
    case 'float':
      return parseRuntimeFloat(raw, baseline[key] ?? 0);
    case 'bool':
      return typeof raw === 'boolean' ? raw : Boolean(entry.default);
    case 'enum':
    case 'csv_enum':
      return String(raw ?? entry.default ?? '').trim();
    case 'string':
      return String(raw ?? entry.default ?? '').trim();
    default:
      return raw as string;
  }
}

export function collectRuntimeSettingsPayload(
  input: RuntimeSettingsPayloadSerializerInput,
): RuntimeSettings {
  const { resolveModelTokenDefaults, runtimeSettingsFallbackBaseline } = input;
  const inputMap = input as unknown as Record<string, unknown>;
  const baseline = runtimeSettingsFallbackBaseline as unknown as Record<string, number>;
  const result: Record<string, string | number | boolean> = {};

  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    if (entry.readOnly || entry.defaultsOnly) continue;
    result[entry.key] = serializeEntry(inputMap, baseline, entry, resolveModelTokenDefaults);
  }

  return result;
}
